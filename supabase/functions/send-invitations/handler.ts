import {
  cors,
  eventAdmin,
  json,
  ProviderDefinitiveError,
  service,
} from "../_shared/http.ts";
import {
  type Delivery,
  provider,
  resendPayloadHash,
} from "../_shared/providers.ts";
import { invitationTemplate } from "./template.ts";
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const validUuid = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
export function invitationHandler(
  deps = {
    service,
    eventAdmin,
    provider,
    base: () => Deno.env.get("PUBLIC_WEB_BASE_URL"),
  },
) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid request" }, 400);
    }
    if (
      !validUuid(body?.event_id) || !validUuid(body?.request_id) ||
      (body.guest_id !== undefined && !validUuid(body.guest_id)) ||
      (body.supersedes_request_id !== undefined &&
        (!validUuid(body.supersedes_request_id) ||
          body.supersedes_request_id === body.request_id)) ||
      Object.keys(body).some((key) =>
        !["event_id", "request_id", "guest_id", "supersedes_request_id"]
          .includes(key)
      )
    ) return json({ error: "invalid request" }, 400);
    try {
      await deps.eventAdmin(request, body.event_id);
    } catch {
      return json({ error: "unauthorized" }, 403);
    }
    const db = deps.service();
    if (body.supersedes_request_id) {
      const { error } = await db.rpc("prepare_invitation_resend", {
        p_event: body.event_id,
        p_previous: body.supersedes_request_id,
        p_request: body.request_id,
        p_guest: body.guest_id || null,
      });
      if (error) return json({ error: "resend reservation failed" }, 503);
    }
    let ids: string[];
    if (body.guest_id) ids = [body.guest_id];
    else {
      // SQL returns the complete scoped list, without PostgREST's default row cap.
      const { data, error } = await db.rpc("prepare_invitation_batch", {
        p_event: body.event_id,
        p_request: body.request_id,
      });
      if (error) return json({ error: "recipient lookup failed" }, 503);
      ids = data || [];
    }
    const results: {
      guest_id: string;
      delivery_id: string;
      status: string;
      reason?: string;
      duplicate?: boolean;
    }[] = [];
    const handled = new Map<string, { status: string; reason?: string }>();
    for (const guest of ids) {
      const { data: reservation, error } = await db.rpc(
        "prepare_invitation_delivery",
        { p_event: body.event_id, p_request: body.request_id, p_guest: guest },
      );
      if (error || !reservation) {
        return json({ error: "reservation failed" }, 503);
      }
      if (reservation.status === "pending" && !reservation.id) {
        results.push({
          guest_id: guest,
          delivery_id: guest,
          status: "pending",
          reason: "payload_changed",
        });
        continue;
      }
      if (reservation.status !== "pending") {
        results.push({
          guest_id: guest,
          delivery_id: reservation.id,
          status: reservation.status,
          reason: reservation.error || undefined,
          duplicate: reservation.duplicate,
        });
        continue;
      }
      const earlier = handled.get(reservation.id);
      if (earlier) {
        results.push({
          guest_id: guest,
          delivery_id: reservation.id,
          ...earlier,
          duplicate: true,
        });
        continue;
      }
      let url = "", configurationError = false;
      try {
        const base = new URL(deps.base() || "");
        if (
          base.protocol !== "https:" || base.username || base.password ||
          base.search || base.hash
        ) throw new ProviderDefinitiveError();
        url = `${base.href.replace(/\/$/, "")}/c/${
          encodeURIComponent(reservation.code || "")
        }`;
      } catch {
        configurationError = true;
      }
      const template = invitationTemplate(
        reservation.name || "",
        url,
        reservation.password || "",
      );
      const delivery: Delivery = {
        id: reservation.id,
        key: reservation.id,
        title: template.title,
        body: template.text,
        html: template.html,
        email: reservation.email || "",
        whatsapp: "",
        tokens: [],
      };
      const hash = await resendPayloadHash(delivery);
      const { data: claim, error: claimError } = await db.rpc(
        "claim_invitation_delivery",
        { p_id: reservation.id, p_hash: hash },
      );
      if (claimError || !claim) return json({ error: "claim failed" }, 503);
      if (!claim.claimed) {
        handled.set(reservation.id, {
          status: claim.status,
          reason: claim.reason,
        });
        results.push({
          guest_id: guest,
          delivery_id: reservation.id,
          status: claim.status,
          reason: claim.reason,
          duplicate: true,
        });
        continue;
      }
      let status = "pending",
        name = "EMAIL",
        providerId: string | undefined,
        reason: string | undefined;
      try {
        if (configurationError) throw new ProviderDefinitiveError();
        if (reservation.available === false) {
          status = reservation.attempted ? "pending" : "skipped";
          reason = reservation.attempted
            ? "payload_changed"
            : "Convite indisponível";
        } else {
          const result = await deps.provider("EMAIL").send(delivery);
          status = reservation.attempted && result.status === "skipped"
            ? "pending"
            : result.status;
          name = result.provider;
          providerId = result.providerId;
          reason = status === "pending" ? "uncertain" : result.reason;
        }
      } catch (error) {
        if (error instanceof ProviderDefinitiveError) {
          // Rejection of this retry does not disprove acceptance of a prior uncertain POST.
          status = reservation.attempted ? "pending" : "failed";
          reason = reservation.attempted
            ? "uncertain"
            : "O serviço de e-mail rejeitou o envio. Verifique a configuração.";
        } else {
          status = "pending";
          reason = "uncertain";
        }
      }
      const finished = await db.rpc("finish_invitation_delivery", {
        p_id: reservation.id,
        p_status: status,
        p_provider: name,
        p_provider_id: providerId || null,
        p_error: reason || null,
        p_claim: claim.token,
      });
      if (finished.error || finished.data === false) {
        return json({ error: "delivery recording failed" }, 503);
      }
      handled.set(reservation.id, { status, reason });
      results.push({
        guest_id: guest,
        delivery_id: reservation.id,
        status,
        ...(reason ? { reason } : {}),
      });
    }
    const uniqueResults = [
      ...new Map(results.map((r) => [r.delivery_id, r])).values(),
    ];
    return json({
      results,
      complete: !results.some((r) => r.status === "pending"),
      sent: uniqueResults.filter((r) => r.status === "sent").length,
      skipped: uniqueResults.filter((r) => r.status === "skipped").length,
      failed: uniqueResults.filter((r) => r.status === "failed").length,
      pending: uniqueResults.filter((r) => r.status === "pending").length,
    });
  };
}
