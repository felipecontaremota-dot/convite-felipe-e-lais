import {
  authenticated,
  eventAdmin,
  json,
  ProviderDefinitiveError,
  service,
} from "../_shared/http.ts";
import {
  provider,
  resendPayloadHash,
  type Delivery,
} from "../_shared/providers.ts";
import { reminderImage, reminderTemplate } from "../_shared/ten-day-content.ts";
type DB = ReturnType<typeof service>;
export const reminderDependencies = {
  service,
  eventAdmin,
  authenticated,
  provider,
  base: () => Deno.env.get("PUBLIC_WEB_BASE_URL") || "",
  image: () => reminderImage(Deno.env.get("SUPABASE_URL") || ""),
  fetch: (url: string, init: RequestInit) => fetch(url, init),
};
export async function imageAvailable(
  url: string,
  fetcher = reminderDependencies.fetch,
) {
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (
      !response.ok ||
      !/^image\/png(?:;|$)/i.test(response.headers.get("content-type") || "")
    ) {
      await response.body?.cancel();
      return false;
    }
    // Stream a bounded prefix; no artwork upload/generation or unnecessary full download.
    const reader = response.body?.getReader();
    if (!reader) return false;
    let bytes = new Uint8Array();
    try {
      while (bytes.length < 24) {
        const next = await reader.read();
        if (next.done) break;
        const joined = new Uint8Array(
          bytes.length + Math.min(next.value.length, 24),
        );
        joined.set(bytes);
        joined.set(next.value.subarray(0, 24), bytes.length);
        bytes = joined;
      }
    } finally {
      await reader.cancel();
    }
    return (
      [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
      bytes.length >= 24 &&
      [0,0,0,13,73,72,68,82].every((n,i)=>bytes[i+8]===n) &&
      new DataView(bytes.buffer).getUint32(16) > 0 &&
      new DataView(bytes.buffer).getUint32(20) > 0
    );
  } catch {
    return false;
  }
}
async function work(
  db: DB,
  action: string,
  args: Record<string, unknown> = {},
) {
  const result = await db.rpc("ten_day_email_work", {
    p_action: action,
    ...args,
  });
  if (result.error) throw Error("reminder persistence failed");
  return result.data;
}
export function invitationUrl(base: string, code: string) {
  const root = new URL(base);
  if (
    root.protocol !== "https:" ||
    !["felipeelais2026.com.br", "www.felipeelais2026.com.br"].includes(root.hostname) ||
    root.username ||
    root.password ||
    root.hash ||
    root.search ||
    /^(localhost|127\.|0\.0\.0\.0)/.test(root.hostname) ||
    !code
  )
    throw new ProviderDefinitiveError();
  return `${root.href.replace(/\/$/, "")}/c/${encodeURIComponent(code)}`;
}
export async function scheduleTenDay(db: DB, deps = reminderDependencies) {
  const due = await work(db, "DUE");
  for (const campaign of due || []) {
    const available = await imageAvailable(deps.image(), deps.fetch);
    await work(db, "IMAGE", {
      p_event: campaign.event_id,
      p_payload: { available },
    });
    await work(db, available ? "PREPARE" : "BLOCK", {
      p_event: campaign.event_id,
    });
  }
}
export async function deliverTenDay(
  db: DB,
  job: {
    id: string;
    event_id: string;
    guest_id: string;
    attempts: number;
    locked_at: string;
    idempotency_key: string;
  },
  deps = reminderDependencies,
) {
  const lease = {
    p_event: job.event_id,
    p_job: job.id,
    p_attempt: job.attempts,
    p_lease: job.locked_at,
  };
  let admission: string | null = null;
  const finish = async (status: string, providerId?: string) => {
    const result = await db.rpc("finish_notification_attempt", {
      ...lease,
      p_status: status,
      p_provider: "resend",
      p_provider_id: providerId || null,
      p_admission: admission,
    });
    if (result.error || result.data !== true)
      throw Error("reminder result not recorded");
  };
  try {
    const available = await imageAvailable(deps.image(), deps.fetch);
    if (!available) {
      await work(db, "IMAGE", {
        p_event: job.event_id,
        p_payload: { available: false },
      });
      await work(db, "BLOCK", { p_event: job.event_id });
    }
    const data = await work(db, "PEEK", lease);
    if (!data?.ready) return "skipped";
    const mail = reminderTemplate(data.subject, data.body, {
      name: data.name,
      url: invitationUrl(deps.base(), data.code),
      pin: data.pin,
      image: deps.image(),
    });
    const delivery: Delivery = {
      id: job.id,
      key: job.idempotency_key,
      title: mail.title,
      body: mail.text,
      html: mail.html,
      email: data.email,
      whatsapp: "",
      tokens: [],
    };
    const hash = await resendPayloadHash(delivery);
    const start = await work(db, "START", { ...lease, p_payload: { hash } });
    if (!start.ready) return "skipped";
    admission = start.admission;
    if (
      typeof admission !== "string" ||
      !Number.isFinite(Date.parse(admission))
    )
      throw Error("invalid admission");
    const result = await deps.provider("EMAIL").send(delivery);
    // A disabled/misconfigured provider did NOT deliver; this is retryable only by a safe failure path.
    const status = result.status === "sent" ? "sent" : "failed";
    await finish(status, result.providerId);
    return status;
  } catch (error) {
    const status =
      admission && !(error instanceof ProviderDefinitiveError)
        ? "uncertain"
        : "failed";
    try {
      await finish(status);
    } catch {
      /* existing admission marker prevents automatic resend */
    }
    return status;
  }
}
export function tenDayAdminHandler(deps = reminderDependencies) {
  return async (request: Request, body: Record<string, unknown>) => {
    const event = body.event_id;
    if (
      typeof event !== "string" ||
      !["IMAGE", "PREVIEW", "TEST"].includes(String(body.ten_day))
    )
      return json({ error: "invalid reminder request" }, 400);
    let actor;
    try {
      await deps.eventAdmin(request, event);
      actor = await deps.authenticated(request);
    } catch {
      return json({ error: "unauthorized" }, 403);
    }
    const db = deps.service();
    const cfgResult = await db.rpc("ten_day_email_config", {
      p_event: event,
      p_actor: actor.id,
    });
    if (cfgResult.error || !cfgResult.data)
      return json({ error: "configuration unavailable" }, 503);
    const cfg = cfgResult.data;
    if (body.ten_day === "IMAGE") {
      const available = await imageAvailable(deps.image(), deps.fetch);
      await work(db, "IMAGE", { p_event: event, p_payload: { available } });
      return json({ available, url: deps.image() });
    }
    const mail = reminderTemplate(cfg.subject, cfg.body, {
      name: "Convidado de teste (fictício)",
      url: invitationUrl(deps.base(), "PREVIA-FICTICIA-SEM-ACESSO"),
      pin: "0000",
      image: deps.image(),
    });
    if (body.ten_day === "PREVIEW") return json(mail);
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      typeof body.request_id !== "string" ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id)
    )
      return json({ error: "invalid test" }, 400);
    if (!(await imageAvailable(deps.image(), deps.fetch)))
      return json(
        { error: "Envio de teste bloqueado: upload da arte pendente." },
        409,
      );
    const reserve = await work(db, "TEST_RESERVE", {
      p_event: event,
      p_payload: { request: body.request_id, actor: actor.id },
    });
    if (!reserve.reserved) return json({ status: "already_requested" });
    try {
      const result = await deps
        .provider("EMAIL")
        .send({
          id: body.request_id,
          key: `ten-day-test:${body.request_id}`,
          title: mail.title,
          body: mail.text,
          html: mail.html,
          email: body.email,
          whatsapp: "",
          tokens: [],
        });
      return json({
        status: result.status === "sent" ? "accepted" : "not_configured",
      });
    } catch (error) {
      return json({
        status:
          error instanceof ProviderDefinitiveError ? "failed" : "uncertain",
      });
    }
  };
}
