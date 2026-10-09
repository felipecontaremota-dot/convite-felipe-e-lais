import { authenticated, cors, json, service } from "../_shared/http.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405);
  try {
    const user = await authenticated(request);
    const body = await request.json();
    if (
      typeof body.code !== "string" || body.code.length > 64 ||
      typeof body.event_id !== "string"
    ) return json({ error: "invalid invitation" }, 400);
    // Gateway-derived source address is hashed; raw addresses never enter audit logs.
    // Also limits by UID and globally; gateway WAF/CAPTCHA must supplement anonymous signup.
    const source = request.headers.get("x-real-ip") || "unknown";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(source),
    );
    const bucket = Array.from(
      new Uint8Array(digest),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const { data, error } = await service().rpc("redeem_invitation", {
      p_event: body.event_id,
      p_user: user.id,
      p_code: body.code,
      p_bucket: bucket,
    });
    if (error || data !== true) {
      return json({ error: "invalid invitation or rate limit" }, 429);
    }
    return json({ linked: true });
  } catch {
    return json({ error: "unauthorized" }, 401);
  }
});
