import { cors, json } from "../_shared/http.ts";
export const invalidAccess = "Código ou PIN inválido.";
interface Dependencies {
  authenticate(request: Request): Promise<{ id: string; is_anonymous?: boolean }>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
export function accessHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "method" }, 405);
    try {
      const user = await deps.authenticate(request);
      if (user.is_anonymous !== true) return json({ error: invalidAccess }, 401);
      const raw = await request.text();
      if (raw.length > 1024) return json({ error: invalidAccess }, 400);
      const body = JSON.parse(raw);
      const identify = body.action === "identify";
      if (typeof body.code !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(body.code) ||
          typeof body.event_id !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.event_id) ||
          (!identify && (typeof body.pin !== "string" || !/^[0-9]{4}$/.test(body.pin))) ||
          (body.action !== undefined && !identify)) return json({ error: invalidAccess }, 400);
      // Trusted gateway source only. Raw addresses and PINs never enter logs.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("x-real-ip") || "unknown"));
      const bucket = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const { data, error } = await deps.rpc(identify ? "identify_invitation" : "redeem_invitation", {
        p_event: body.event_id, p_user: user.id, p_code: body.code, p_bucket: bucket,
        ...(!identify ? { p_pin: body.pin } : {}),
      });
      if (error || (identify ? !data : data !== true)) return json({ error: invalidAccess }, 429);
      return json(identify ? data : { linked: true });
    } catch { return json({ error: invalidAccess }, 401); }
  };
}
