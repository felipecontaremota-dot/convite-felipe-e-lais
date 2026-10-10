import { invitationHandler } from "./handler.ts";
import { invitationTemplate } from "./template.ts";
import {
  ProviderDefinitiveError,
  ProviderUncertainError,
  service,
} from "../_shared/http.ts";
import {
  type Delivery,
  DisabledProvider,
  ResendProvider,
} from "../_shared/providers.ts";
const event = "00000000-0000-4000-8000-000000000001",
  guest = "dddddddd-0000-4000-8000-000000000001",
  requestId = "dddddddd-1000-4000-8000-000000000001";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
function request(body: object = {}) {
  return new Request("https://fixture.test", {
    method: "POST",
    body: JSON.stringify({
      event_id: event,
      request_id: requestId,
      guest_id: guest,
      ...body,
    }),
  });
}
function fixture(
  mode: "sent" | "failed" | "disabled" | "resend" = "sent",
  authorized = true,
) {
  let sends = 0, reservations = 0;
  const stored = new Map<string, Record<string, unknown>>();
  const finishes: Record<string, unknown>[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "prepare_invitation_delivery") {
        reservations++;
        const key = `${args.p_request}:${args.p_guest}`;
        if (stored.has(key)) {
          return {
            data: {
              ...stored.get(key),
              email: "guest@example.test",
              name: "<Convidado>",
              code: "CodeSeguroNaoEnumeravelCom32Chars",
              password: "0047",
              duplicate: true,
            },
            error: null,
          };
        }
        const row = { id: key, status: "pending", duplicate: false };
        stored.set(key, row);
        return {
          data: {
            ...row,
            email: "guest@example.test",
            name: "<Convidado>",
            unit_name: "Família",
            code: "CodeSeguroNaoEnumeravelCom32Chars",
            password: "0047",
          },
          error: null,
        };
      }
      if (name === "claim_invitation_delivery") {
        const row = stored.get(String(args.p_id))!;
        if (row.status !== "pending" || row.locked) {
          return {
            data: { claimed: false, status: row.status, reason: "processing" },
            error: null,
          };
        }
        if (row.expired) {
          return {
            data: { claimed: false, status: "pending", reason: "expired" },
            error: null,
          };
        }
        if (row.hash && row.hash !== args.p_hash) {
          return {
            data: {
              claimed: false,
              status: "pending",
              reason: "payload_changed",
            },
            error: null,
          };
        }
        row.locked = true;
        row.hash = args.p_hash;
        return { data: { claimed: true, token: "lease" }, error: null };
      }
      assert(name === "finish_invitation_delivery", "finish RPC");
      finishes.push(args);
      stored.set(String(args.p_id), {
        ...stored.get(String(args.p_id)),
        locked: false,
        id: args.p_id,
        status: args.p_status,
        error: args.p_error,
      });
      return { data: null, error: null };
    },
  } as unknown as ReturnType<typeof service>;
  const handler = invitationHandler({
    service: () => db,
    eventAdmin: async (_r, e) => {
      assert(e === event, "scoped event");
      if (!authorized) throw Error("unauthorized");
    },
    base: () => "https://example.test/convite-felipe-e-lais",
    provider: () =>
      mode === "resend"
        ? new ResendProvider()
        : mode === "disabled"
        ? new DisabledProvider("email")
        : {
          send: async (d: Delivery) => {
            sends++;
            assert(
              d.body.includes("Senha de acesso: 0047") &&
                d.body.includes("/convite-felipe-e-lais/c/"),
              "server credentials and correct base path",
            );
            assert(
              d.html?.includes("&lt;Convidado&gt;") &&
                !d.html.includes("<Convidado>"),
              "escaped template",
            );
            if (mode === "failed") {
              throw new ProviderDefinitiveError(401);
            }
            return {
              status: "sent" as const,
              provider: "resend",
              providerId: "mock-resend",
            };
          },
        },
  });
  return {
    db,
    handler,
    finishes,
    sends: () => sends,
    reservations: () => reservations,
    stored,
  };
}
Deno.test("successful invitation uses server credentials, no consent gate, records sent; same request never resends; new click can resend", async () => {
  const f = fixture();
  assert(
    (await f.handler(request({ password: "malicious-client-password" })))
      .status === 400,
    "client password is never accepted",
  );
  const first = await (await f.handler(request())).json();
  assert(
    first.sent === 1 && f.finishes[0].p_status === "sent",
    "sent recorded",
  );
  assert(
    !JSON.stringify(first).includes("0047") &&
      !JSON.stringify(f.finishes).includes("0047"),
    "no password in response/delivery metadata",
  );
  await f.handler(request());
  assert(f.sends() === 1, "network retry duplicate");
  await f.handler(
    request({ request_id: "dddddddd-1000-4000-8000-000000000002" }),
  );
  assert(f.sends() === 2, "explicit resend");
});
Deno.test("provider failures and absent provider are explicit and never recorded as sent", async () => {
  for (const mode of ["failed", "disabled"] as const) {
    const f = fixture(mode);
    const result = await (await f.handler(request())).json();
    assert(result.sent === 0 && f.finishes[0].p_status !== "sent", "not sent");
    assert(
      !JSON.stringify(f.finishes).includes("secret/password"),
      "sanitized failure",
    );
  }
});
Deno.test("non ADMIN is rejected before reservation or provider access", async () => {
  const f = fixture("sent", false);
  assert(
    (await f.handler(request())).status === 403 && f.reservations() === 0 &&
      f.sends() === 0,
    "fail closed",
  );
});
Deno.test("provisional template escapes all dynamic HTML and keeps textual fallback", () => {
  const result = invitationTemplate(
    "<script>",
    'https://example.test/c/code?x="',
    "0047",
  );
  assert(
    !result.html.includes("<script>") && result.html.includes("&quot;") &&
      result.text.includes("Senha de acesso: 0047"),
    "escaping",
  );
});
Deno.test("bulk targets complete authorized event list; database duplicates do not call provider twice", async () => {
  let sent = 0;
  const seen = new Set<string>();
  const ids = [
    guest,
    "dddddddd-0000-4000-8000-000000000002",
    "dddddddd-0000-4000-8000-000000000003",
  ];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "prepare_invitation_batch") {
        assert(args.p_event === event, "scoped target lookup");
        return { data: ids, error: null };
      }
      if (name === "finish_invitation_delivery") {
        return {
          data: null,
          error: null,
        };
      }
      if (name === "claim_invitation_delivery") {
        return { data: { claimed: true, token: "lease" }, error: null };
      }
      assert(
        name === "prepare_invitation_delivery" && args.p_event === event,
        "scoped reservation",
      );
      const unit = args.p_guest === ids[2] ? "individual" : "family",
        duplicate = seen.has(unit);
      seen.add(unit);
      return {
        data: {
          id: unit,
          status: duplicate ? "sent" : "pending",
          duplicate,
          name: "Guest",
          code: "CodeSeguroNaoEnumeravelCom32Chars",
          password: "1234",
          email: "same@example.test",
        },
        error: null,
      };
    },
  } as unknown as ReturnType<typeof service>;
  const handler = invitationHandler({
    service: () => db,
    eventAdmin: async () => {},
    base: () => "https://example.test",
    provider: () => ({
      send: async () => {
        sent++;
        return { status: "sent" as const, provider: "resend" };
      },
    }),
  });
  const body = { event_id: event, request_id: requestId };
  const response = await (await handler(
    new Request("https://fixture.test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  )).json();
  assert(
    sent === 2 && response.results.length === 3 &&
      response.results[1].duplicate === true,
    "family dedup, independent unit retained",
  );
});
Deno.test("real Resend abstraction mocked at HTTP boundary records accepted invitation and sanitizes failure", async () => {
  const previous = globalThis.fetch;
  try {
    for (const accepted of [true, false]) {
      let calls = 0;
      globalThis.fetch = async (input, init) => {
        assert(
          String(input) === "https://api.resend.com/emails",
          "shared Resend endpoint",
        );
        const body = JSON.parse(String(init?.body));
        assert(
          body.html.includes("ABRIR NOSSO CONVITE") &&
            body.text.includes("Senha de acesso: 0047"),
          "centralized template sent",
        );
        assert(
          (init?.headers as Record<string, string>)["Idempotency-Key"].includes(
            requestId,
          ),
          "stable reservation provider key",
        );
        calls++;
        return accepted
          ? Response.json({ id: "resend-accepted" })
          : new Response("untrusted response", { status: 503 });
      };
      const f = fixture("resend");
      await f.handler(request());
      assert(
        calls === 1 &&
          f.finishes[0].p_status === (accepted ? "sent" : "pending"),
        "truthful provider outcome recorded",
      );
      assert(
        !JSON.stringify(f.finishes).includes("0047"),
        "no password in persisted metadata",
      );
    }
  } finally {
    globalThis.fetch = previous;
  }
});
Deno.test("simultaneous retries reserve once and never call email provider twice", async () => {
  const f = fixture();
  const responses = await Promise.all([
    f.handler(request()),
    f.handler(request()),
  ]);
  assert(
    responses.every((r) => r.status === 200) && f.sends() === 1,
    "concurrent duplicate prevented",
  );
});

Deno.test("accepted email with lost response stays pending; retry uses the identical key/payload and confirms one logical email", async () => {
  const previous = globalThis.fetch;
  const accepted = new Map<string, string>();
  let posts = 0;
  Deno.env.set("EMAIL_FROM", "sender@example.test");
  globalThis.fetch = async (_input, init) => {
    posts++;
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"],
      body = String(init?.body);
    if (!accepted.has(key)) {
      accepted.set(key, body);
      throw new DOMException("untrusted password 0047", "TimeoutError");
    }
    assert(accepted.get(key) === body, "identical canonical POST on retry");
    return Response.json({ id: "one-logical-email" });
  };
  try {
    const f = fixture("resend");
    const first = await (await f.handler(request())).json();
    assert(
      first.pending === 1 && first.complete === false &&
        f.finishes[0].p_status === "pending",
      "timeout is pending, not failed",
    );
    assert(!JSON.stringify(first).includes("0047"), "sanitized response");
    const second = await (await f.handler(request())).json();
    assert(
      second.sent === 1 && second.complete === true &&
        f.finishes[1].p_provider_id === "one-logical-email",
      "confirmed retry",
    );
    assert(
      accepted.size === 1 && posts === 2 && f.stored.size === 1,
      "one reservation and logical email",
    );
    await f.handler(request());
    assert(posts === 2, "definitive sent is never reposted");
  } finally {
    globalThis.fetch = previous;
    Deno.env.delete("EMAIL_FROM");
  }
});
Deno.test("pending invitation refuses changed payload or expired window without a provider POST", async () => {
  const previous = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = async () => {
    posts++;
    throw new TypeError("network");
  };
  try {
    for (const changed of [true, false]) {
      const f = fixture("resend");
      await f.handler(request());
      const row = [...f.stored.values()][0];
      if (changed) row.hash = "changed-hash";
      else row.expired = true;
      const before = posts;
      const retry = await (await f.handler(request())).json();
      assert(
        posts === before && retry.pending === 1 && retry.complete === false,
        "unsafe retry does not POST",
      );
      assert(
        retry.results[0].reason === (changed ? "payload_changed" : "expired"),
        "safe reason",
      );
      assert(f.finishes.length === 1, "no finalization when blocked");
    }
  } finally {
    globalThis.fetch = previous;
  }
});

Deno.test("mixed bulk retries only pending reservations, with original keys; family aliases never immediately retry uncertainty", async () => {
  const ids = [
    guest,
    "dddddddd-0000-4000-8000-000000000002",
    "dddddddd-0000-4000-8000-000000000003",
    "dddddddd-0000-4000-8000-000000000004",
  ];
  const rows = new Map<
    string,
    { status: string; locked: boolean; hash?: string }
  >();
  const posts: string[] = [];
  let pendingAttempts = 0;
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "prepare_invitation_batch") {
        return { data: ids, error: null };
      }
      if (name === "prepare_invitation_delivery") {
        const id = args.p_guest === ids[3] ? ids[1] : String(args.p_guest);
        if (!rows.has(id)) {
          rows.set(id, {
            status: id === ids[2] ? "skipped" : "pending",
            locked: false,
          });
        }
        return {
          data: {
            id,
            ...rows.get(id),
            email: "guest@example.test",
            name: "Guest",
            code: "code",
            password: "0047",
          },
          error: null,
        };
      }
      const row = rows.get(String(args.p_id))!;
      if (name === "claim_invitation_delivery") {
        if (row.locked || row.status !== "pending") {
          return {
            data: { claimed: false, status: row.status, reason: "processing" },
            error: null,
          };
        }
        assert(!row.hash || row.hash === args.p_hash, "same bulk payload");
        row.hash = String(args.p_hash);
        row.locked = true;
        return { data: { claimed: true, token: "lease" }, error: null };
      }
      assert(name === "finish_invitation_delivery", "finish");
      row.status = String(args.p_status);
      row.locked = false;
      return { data: true, error: null };
    },
  } as unknown as ReturnType<typeof service>;
  const handler = invitationHandler({
    service: () => db,
    eventAdmin: async () => {},
    base: () => "https://example.test",
    provider: () => ({
      send: async (d) => {
        posts.push(d.key);
        if (d.key === ids[1] && pendingAttempts++ === 0) {
          throw new ProviderUncertainError();
        }
        return { status: "sent", provider: "resend", providerId: d.key };
      },
    }),
  });
  const bulk = () => request({ guest_id: undefined });
  const first = await (await handler(bulk())).json();
  assert(
    first.sent === 1 && first.pending === 1 && first.skipped === 1 &&
      first.complete === false,
    "unique reservation counts and mixed pending batch",
  );
  assert(
    posts.join(",") === ids.slice(0, 2).join(","),
    "alias does not retry pending in same invocation",
  );
  const retry = await (await handler(bulk())).json();
  assert(
    retry.sent === 2 && retry.pending === 0 && retry.complete === true,
    "batch completed",
  );
  assert(
    posts.join(",") === [ids[0], ids[1], ids[1]].join(","),
    "only original pending reservation reposted",
  );
});

Deno.test("explicit resend acknowledges and reserves atomically before POST; failed reservation never sends", async () => {
  for (const failure of [true, false]) {
    const f = fixture();
    const original = f.db.rpc.bind(f.db);
    let acknowledged = false;
    f.db.rpc = ((name: string, args: Record<string, unknown>) => {
      if (name === "prepare_invitation_resend") {
        assert(f.sends() === 0, "acknowledgment precedes provider call");
        assert(
          args.p_event === event &&
            args.p_previous === "eeeeeeee-1000-4000-8000-000000000001" &&
            args.p_guest === guest,
          "scoped explicit override",
        );
        acknowledged = true;
        return Promise.resolve({
          data: null,
          error: failure ? { message: "unavailable" } : null,
        });
      }
      return original(name, args);
    }) as typeof f.db.rpc;
    const response = await f.handler(
      request({
        supersedes_request_id: "eeeeeeee-1000-4000-8000-000000000001",
      }),
    );
    assert(
      acknowledged && response.status === (failure ? 503 : 200),
      "durable override checked",
    );
    assert(
      f.sends() === (failure ? 0 : 1),
      "no POST without replacement reservation",
    );
  }
});
