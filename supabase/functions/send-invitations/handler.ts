import { cors, eventAdmin, json, service } from "../_shared/http.ts";
import { provider } from "../_shared/providers.ts";
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
      Object.keys(body).some((key) =>
        !["event_id", "request_id", "guest_id"].includes(key)
      )
    ) return json({ error: "invalid request" }, 400);
    try {
      await deps.eventAdmin(request, body.event_id);
    } catch {
      return json({ error: "unauthorized" }, 403);
    }
    const db = deps.service();
    let ids: string[];
    if (body.guest_id) ids = [body.guest_id];
    else {
      // SQL returns the complete scoped list, without PostgREST's default row cap.
      const { data, error } = await db.rpc("invitation_delivery_targets", {
        p_event: body.event_id,
      });
      if (error) return json({ error: "recipient lookup failed" }, 503);
      ids = data || [];
    }
    const results: {
      guest_id: string;
      status: string;
      reason?: string;
      duplicate?: boolean;
    }[] = [];
    for (const guest of ids) {
      const { data: reservation, error } = await db.rpc(
        "prepare_invitation_delivery",
        { p_event: body.event_id, p_request: body.request_id, p_guest: guest },
      );
      if (error || !reservation) {
        return json({ error: "reservation failed" }, 503);
      }
      if (reservation.duplicate || reservation.status !== "pending") {
        results.push({
          guest_id: guest,
          status: reservation.status,
          reason: reservation.error || undefined,
          duplicate: reservation.duplicate,
        });
        continue;
      }
      let status = "failed",
        name = "EMAIL",
        providerId: string | undefined,
        reason: string | undefined;
      try {
        const base = new URL(deps.base() || "");
        if (
          base.protocol !== "https:" || base.username || base.password ||
          base.search || base.hash
        ) throw Error("invalid base");
        const url = `${base.href.replace(/\/$/, "")}/c/${
          encodeURIComponent(reservation.code)
        }`;
        const template = invitationTemplate(
          reservation.name,
          url,
          reservation.password,
        );
        const result = await deps.provider("EMAIL").send({
          id: reservation.id,
          key: reservation.id,
          title: template.title,
          body: template.text,
          html: template.html,
          email: reservation.email,
          whatsapp: "",
          tokens: [],
        });
        status = result.status;
        name = result.provider;
        providerId = result.providerId;
        reason = result.reason;
      } catch {
        // Never serialize provider errors: they may contain request content/credentials.
        reason =
          "Não foi possível enviar o convite. Verifique a configuração do serviço de e-mail.";
      }
      const finished = await db.rpc("finish_invitation_delivery", {
        p_id: reservation.id,
        p_status: status,
        p_provider: name,
        p_provider_id: providerId || null,
        p_error: reason || null,
      });
      if (finished.error) {
        return json({ error: "delivery recording failed" }, 503);
      }
      results.push({ guest_id: guest, status, ...(reason ? { reason } : {}) });
    }
    return json({
      results,
      sent: results.filter((r) => r.status === "sent" && !r.duplicate).length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      pending: results.filter((r) => r.status === "pending").length,
    });
  };
}
