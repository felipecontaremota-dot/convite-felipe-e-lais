// Test-only HTTP adapter: real recovery-independent invitation handler and CORS, disposable DB RPC bridge.
import { accessHandler } from "../../supabase/functions/redeem-invitation/handler.ts";
import { cors, json } from "../../supabase/functions/_shared/http.ts";
const bridge = Deno.env.get("TEST_RPC_BRIDGE")!;
const admin = "bcbcbcbc-0000-4000-8000-000000000001";
let options = 0,
  posts = 0,
  breakCors = false;
const encode = (v: unknown) =>
  btoa(JSON.stringify(v))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
function user(id: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: id !== admin,
    email: id === admin ? "admin@example.test" : undefined,
  };
}
function session(id: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: user(id),
  };
}
function uid(request: Request) {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) throw Error("unauthorized");
  return JSON.parse(atob(token.split(".")[1])).sub as string;
}
async function rpc(name: string, args: Record<string, unknown>, id: string) {
  const r = await fetch(bridge, {
    method: "POST",
    body: JSON.stringify({ name, args, uid: id }),
  });
  return r.json();
}
const access = accessHandler({
  authenticate: async (request) => user(uid(request)),
  rpc: async (name, args) => rpc(name, args, String(args.p_user)),
});
Deno.serve({ port: 54321, hostname: "127.0.0.1" }, async (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/fixture/stats") return json({ options, posts });
  if (path === "/fixture/cors") {
    breakCors = (await request.json()).broken === true;
    return json({});
  }
  if (path === "/functions/v1/redeem-invitation") {
    if (request.method === "OPTIONS") {
      options++;
      const response = await access(request);
      if (breakCors)
        response.headers.set(
          "Access-Control-Allow-Headers",
          "authorization, apikey, content-type, x-worker-secret",
        );
      return response;
    }
    posts++;
    return access(request);
  }
  if (request.method === "OPTIONS")
    return new Response(null, {
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers":
          cors["Access-Control-Allow-Headers"] +
          ", x-supabase-api-version, content-profile, accept-profile",
      },
    });
  if (path === "/auth/v1/signup") {
    const id = crypto.randomUUID();
    await rpc("fixture_user", { id }, id);
    return json(session(id));
  }
  if (path === "/auth/v1/token") return json(session(admin));
  if (path === "/auth/v1/user") return json(user(uid(request)));
  if (path === "/auth/v1/logout") return json({});
  if (path.startsWith("/rest/v1/rpc/")) {
    const result = await rpc(
      path.split("/").at(-1)!,
      await request.json(),
      uid(request),
    );
    return result.error ? json(result.error, 400) : json(result.data);
  }
  return json({ error: "fixture route unavailable" }, 404);
});
