import { cors, json } from "../_shared/http.ts";
export const invalidAccess = "Senha inválida.";
interface Dependencies {
  authenticate(request: Request): Promise<{ id: string; is_anonymous?: boolean }>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
export function accessHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ code: "method" }, 405);
    let user;
    try { user = await deps.authenticate(request); }
    catch { return json({ code: "unauthorized" }, 401); }
    if (user.is_anonymous !== true) return json({ code: "staff_session" }, 403);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 1024) return json({ code: "invalid_link" }, 400);
      body = JSON.parse(raw);
    } catch { return json({ code: "invalid_link" }, 400); }
    const identify = body?.action === "identify";
    if (typeof body?.code !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(body.code) ||
        typeof body.event_id !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.event_id) ||
        (body.action !== undefined && !identify)) return json({ code: "invalid_link" }, 400);
    if (!identify && (typeof body.pin !== "string" || !/^[0-9]{4}$/.test(body.pin))) return json({ code: "invalid_password" }, 400);
    try {
      // No raw addresses, codes or passwords in logs.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("x-real-ip") || "unknown"));
      const bucket = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const args = { p_event: body.event_id, p_user: user.id, p_code: body.code, p_bucket: bucket };
      const lookup = await deps.rpc("identify_invitation", args);
      if (lookup.error) return json({ code: "technical" }, 503);
      if (!lookup.data) return json({ code: "invalid_link" }, 404);
      if (identify) return json(lookup.data);
      const { data, error } = await deps.rpc("redeem_invitation", { ...args, p_pin: body.pin });
      if (error) return json({ code: "technical" }, 503);
      if (data !== true) return json({ code: "invalid_password" }, 400);
      return json({ linked: true });
    } catch { return json({ code: "technical" }, 503); }
  };
}
