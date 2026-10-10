import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { accessHandler } from "../redeem-invitation/handler.ts";
import { dispatchHandler } from "../dispatch-notifications/index.ts";
import { invitationHandler } from "../send-invitations/handler.ts";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
Deno.test("real supabase.functions.invoke headers pass explicit preflight and reach identify/redeem", async () => {
  const rpc: string[] = [];
  const handler = accessHandler({
    authenticate: async () => ({ id: "anonymous", is_anonymous: true }),
    rpc: async (name) => {
      rpc.push(name);
      return {
        data: name === "identify_invitation"
          ? { name: "Família", activated: false }
          : true,
        error: null,
      };
    },
  });
  let preflights = 0, posts = 0;
  const client = createClient("https://fixture.test", "public-fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const req = new Request(input, init);
        const names = [...req.headers.keys()];
        const preflight = await handler(
          new Request(req.url, {
            method: "OPTIONS",
            headers: {
              origin: "https://web.test",
              "access-control-request-method": "POST",
              "access-control-request-headers": names.join(", "),
            },
          }),
        );
        const allowed = preflight.headers.get("access-control-allow-headers")!
          .split(",").map((v) => v.trim());
        assert(
          preflight.status === 200 &&
            names.every((name) => allowed.includes(name)),
          "browser preflight permits every SDK header",
        );
        assert(names.includes("x-client-info"), "actual SDK client header");
        preflights++;
        posts++;
        return handler(req);
      },
    },
  });
  for (const body of [{ action: "identify" }, { pin: "0047" }]) {
    const response = await client.functions.invoke("redeem-invitation", {
      body: {
        event_id: "00000000-0000-4000-8000-000000000001",
        code: "CodeSeguroNaoEnumeravelCom32Chars",
        ...body,
      },
    });
    assert(!response.error, "invoke succeeds");
  }
  assert(preflights === 2 && posts === 2, "POST follows OPTIONS");
  assert(
    rpc.join(",") ===
      "identify_invitation,identify_invitation,redeem_invitation",
    "real RPC paths",
  );
});
Deno.test("every frontend Edge function preflight accepts SDK headers before auth and exposes no wildcard headers", async () => {
  for (const handler of [dispatchHandler(), invitationHandler()]) {
    const response = await handler(
      new Request("https://fixture.test", {
        method: "OPTIONS",
        headers: {
          "access-control-request-headers":
            "authorization,apikey,content-type,x-client-info",
        },
      }),
    );
    const headers = response.headers.get("access-control-allow-headers")!;
    assert(
      response.status === 200 && headers.includes("x-client-info") &&
        headers.includes("x-worker-secret") && !headers.includes("*"),
      "restricted CORS",
    );
  }
});
Deno.test("actual SDK invokes dispatch and send-invitations after preflight; server rejects missing ADMIN without CORS failure", async () => {
  for (
    const [name, handler] of [["dispatch-notifications", dispatchHandler()], [
      "send-invitations",
      invitationHandler(),
    ]] as const
  ) {
    let posts = 0;
    const client = createClient("https://fixture.test", "public-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const req = new Request(input, init);
          const options = await handler(
            new Request(req.url, { method: "OPTIONS" }),
          );
          const allowed = options.headers.get("access-control-allow-headers")!
            .split(",").map((h) => h.trim());
          assert(
            [...req.headers.keys()].every((h) => allowed.includes(h)),
            "actual invoke headers allowed",
          );
          posts++;
          return handler(req);
        },
      },
    });
    const result = await client.functions.invoke(name, {
      body: {
        event_id: "00000000-0000-4000-8000-000000000001",
        ...(name === "dispatch-notifications"
          ? { message_id: "11111111-1111-4111-8111-111111111111" }
          : {}),
        request_id: "dddddddd-1000-4000-8000-000000000001",
        guest_id: "dddddddd-0000-4000-8000-000000000001",
      },
    });
    assert(
      posts === 1 && result.error?.context.status === 403,
      "POST reached role check, no technical CORS failure",
    );
  }
});
Deno.test("production eventAdmin verifies JWT user and user-scoped event_role; ADMIN only", async () => {
  const { eventAdmin } = await import("./http.ts");
  const previous = globalThis.fetch;
  const env = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const saved = env.map((k) => Deno.env.get(k));
  Deno.env.set("SUPABASE_URL", "https://fixture.test");
  Deno.env.set("SUPABASE_ANON_KEY", "public-fixture-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-only-fixture-key");
  try {
    for (const role of ["ADMIN", "CEREMONIALIST", null]) {
      let checks = 0;
      globalThis.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        const headers = new Headers(init?.headers);
        assert(
          headers.get("authorization") === "Bearer user-fixture-jwt",
          "server validates and forwards user JWT, never service key as user identity",
        );
        if (path === "/auth/v1/user") {
          return Response.json({
            id: "dddddddd-0000-4000-8000-000000000001",
            is_anonymous: false,
          });
        }
        assert(
          path === "/rest/v1/rpc/event_role" &&
            JSON.parse(String(init?.body)).p_event ===
              "00000000-0000-4000-8000-000000000001",
          "role checked for exact requested event",
        );
        checks++;
        return Response.json(role);
      };
      let accepted = true;
      try {
        await eventAdmin(
          new Request("https://fixture.test", {
            headers: { Authorization: "Bearer user-fixture-jwt" },
          }),
          "00000000-0000-4000-8000-000000000001",
        );
      } catch {
        accepted = false;
      }
      assert(
        accepted === (role === "ADMIN") && checks === 1,
        "ADMIN only, not ceremonial or no role",
      );
    }
  } finally {
    globalThis.fetch = previous;
    env.forEach((k, i) =>
      saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!)
    );
  }
});
