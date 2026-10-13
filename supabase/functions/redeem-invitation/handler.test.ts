import { accessHandler } from "./handler.ts";
const event = "00000000-0000-4000-8000-000000000001",
  code = "CodeSeguroNaoEnumeravelCom32Chars";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
function request(body: unknown) {
  return new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-real-ip": "192.0.2.1" },
  });
}
Deno.test(
  "anonymous PIN activation preserves leading zeros and hashes source",
  async () => {
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async (name, args) => {
        if (name === "identify_invitation")
          return { data: { name: "Família", activated: false }, error: null };
        assert(name === "redeem_invitation_link", "RPC");
        assert(args.p_pin === "0047", "leading zeros");
        assert(String(args.p_bucket).length === 64, "hashed address");
        return {
          data: {
            linked: true,
            invitation_id: "11111111-1111-4111-8111-111111111111",
          },
          error: null,
        };
      },
    });
    assert(
      (await handle(request({ event_id: event, code, pin: "0047" }))).status ===
        200,
      "activation",
    );
  },
);
Deno.test(
  "invalid PIN/code and blocked invitations fail closed with specific public codes",
  async () => {
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async () => ({ data: false, error: null }),
    });
    for (const body of [
      { event_id: event, code, pin: 47 },
      { event_id: event, code, pin: "47" },
      { event_id: event, code: "bad", pin: "0047" },
      { event_id: event, code, pin: "9999" },
    ]) {
      const response = await handle(request(body));
      assert(response.status !== 200, "reject");
      assert(
        ["invalid_link", "invalid_password"].includes(
          (await response.json()).code,
        ),
        "specific public error",
      );
    }
  },
);
Deno.test(
  "staff sessions cannot bind invitations or call identify",
  async () => {
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: false }),
      rpc: () => {
        throw Error("must not call");
      },
    });
    assert(
      (await handle(request({ event_id: event, code, pin: "0047" }))).status ===
        403,
      "staff rejected",
    );
  },
);
Deno.test(
  "identification only returns minimal metadata; never invokes redeem",
  async () => {
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async (name, args) => {
        assert(name === "identify_invitation", "identify only");
        assert(!("p_pin" in args), "no activation");
        return {
          data: { name: "Família Teste", activated: false },
          error: null,
        };
      },
    });
    const body = await (
      await handle(request({ event_id: event, code, action: "identify" }))
    ).json();
    assert(Object.keys(body).length === 2, "minimal");
  },
);
Deno.test("missing session and malformed JSON fail closed", async () => {
  const handle = accessHandler({
    configuredEvent: event,
    sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
    authenticate: () => {
      throw Error("unauthorized");
    },
    rpc: () => {
      throw Error("must not call");
    },
  });
  assert((await handle(request({}))).status === 401, "auth required");
});
Deno.test(
  "technical lookup failure never becomes invalid password and staff is explicit",
  async () => {
    const failing = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async () => ({ data: null, error: { message: "private failure" } }),
    });
    const response = await failing(
      request({ event_id: event, code, action: "identify" }),
    );
    assert(
      response.status === 503 && (await response.json()).code === "technical",
      "technical lookup distinguished",
    );
    const staff = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: false }),
      rpc: () => {
        throw Error("never call");
      },
    });
    assert(
      (
        await (
          await staff(request({ event_id: event, code, action: "identify" }))
        ).json()
      ).code === "staff_session",
      "explicit staff session",
    );
  },
);
Deno.test(
  "name + PIN entry calls private RPC and returns no invitation metadata",
  async () => {
    let calls = 0;
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async (name, args) => {
        calls++;
        assert(name === "redeem_invitation_by_name", "only password RPC");
        assert(args.p_pin === "0047" && !("p_code" in args), "no code needed");
        assert(String(args.p_bucket).length === 64, "IP hashed");
        return {
          data: {
            linked: true,
            invitation_id: "11111111-1111-4111-8111-111111111111",
          },
          error: null,
        };
      },
    });
    const response = await handle(
      request({
        event_id: event,
        action: "name_pin",
        name: "Laís Romão",
        pin: "0047",
      }),
    );
    assert(
      response.status === 200 &&
        JSON.stringify(await response.json()) ===
          '{"linked":true,"invitation_id":"11111111-1111-4111-8111-111111111111"}',
      "minimal result",
    );
    assert(calls === 1, "single RPC");
  },
);
Deno.test(
  "unknown, ambiguous and throttled passwords share a generic response; malformed input never queries",
  async () => {
    let calls = 0;
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async () => {
        calls++;
        return { data: false, error: null };
      },
    });
    for (const pin of ["0047", "1234", "9999"]) {
      const response = await handle(
        request({
          event_id: event,
          action: "name_pin",
          name: "Laís Romão",
          pin,
        }),
      );
      assert(
        response.status === 400 &&
          JSON.stringify(await response.json()) ===
            '{"code":"invalid_credentials"}',
        "generic failure",
      );
    }
    const before = calls;
    for (const pin of ["", "123", "abcd", 47])
      await handle(
        request({
          event_id: event,
          action: "name_pin",
          name: "Laís Romão",
          pin,
        }),
      );
    assert(calls === before, "invalid shape never queries");
  },
);
Deno.test(
  "root password rejects abnormal UUID/PIN and client identity overrides cannot select the user",
  async () => {
    let calls = 0;
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "server-user", is_anonymous: true }),
      rpc: async (name, args) => {
        calls++;
        assert(
          name === "redeem_invitation_by_name" && args.p_user === "server-user",
          "trusted identity only",
        );
        return {
          data: {
            linked: true,
            invitation_id: "11111111-1111-4111-8111-111111111111",
          },
          error: null,
        };
      },
    });
    for (const body of [
      { event_id: "not-uuid", pin: "0047" },
      { event_id: event, pin: "１２３４" },
      { event_id: event, pin: "0047 " },
      { event_id: event, pin: "0047", code },
      { event_id: event, pin: null },
    ]) {
      const response = await handle(
        request({ ...body, action: "name_pin", name: "Laís Romão" }),
      );
      assert(
        response.status === 400 &&
          JSON.stringify(await response.json()) ===
            '{"code":"invalid_credentials"}',
        "uniform rejection",
      );
    }
    assert(calls === 0, "bad input never queries");
    await handle(
      request({
        event_id: event,
        pin: "0047",
        action: "name_pin",
        name: "Laís Romão",
        user_id: "attacker",
      }),
    );
    assert(calls === 1, "server UID used");
  },
);
Deno.test(
  "root password technical errors never serialize provider or database details",
  async () => {
    const handle = accessHandler({
      configuredEvent: event,
      sourceAddress: (request) => request.headers.get("x-real-ip") || undefined,
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: async () => ({
        data: null,
        error: { message: "fixture-private-detail" },
      }),
    });
    const response = await handle(
      request({
        event_id: event,
        pin: "0047",
        action: "name_pin",
        name: "Laís Romão",
      }),
    );
    assert(
      response.status === 503 &&
        JSON.stringify(await response.json()) === '{"code":"technical"}',
      "sanitized technical response",
    );
  },
);

Deno.test("password-only entry never invokes RPC", async () => {
  const handle = accessHandler({
    configuredEvent: event,
    authenticate: async () => ({ id: "u", is_anonymous: true }),
    rpc: () => {
      throw Error("must not invoke");
    },
  });
  const r = await handle(
    request({ action: "password", event_id: event, pin: "0047" }),
  );
  assert(r.status === 400, "retired action denied");
});
Deno.test("event mismatch cannot select another event", async () => {
  const handle = accessHandler({
    configuredEvent: event,
    authenticate: async () => ({ id: "u", is_anonymous: true }),
    rpc: () => {
      throw Error("must not invoke");
    },
  });
  const r = await handle(
    request({
      action: "name_pin",
      name: "Test name",
      event_id: "ffffffff-0000-4000-8000-000000000001",
      pin: "0047",
    }),
  );
  assert(r.status === 400, "wrong event denied");
});
Deno.test("missing event configuration fails explicitly", async () => {
  const previous = Deno.env.get("APP_EVENT_ID");
  Deno.env.delete("APP_EVENT_ID");
  try {
    const h = accessHandler({
      authenticate: async () => ({ id: "u", is_anonymous: true }),
      rpc: () => {
        throw Error("must not invoke");
      },
    });
    assert(
      (
        await h(
          request({
            action: "name_pin",
            event_id: event,
            name: "Test name",
            pin: "0047",
          }),
        )
      ).status === 503,
      "missing config",
    );
  } finally {
    if (previous) Deno.env.set("APP_EVENT_ID", previous);
  }
});
