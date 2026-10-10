import { invitationHandler } from "./handler.ts";
import { invitationTemplate } from "./template.ts";
import { service } from "../_shared/http.ts";
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
            data: { ...stored.get(key), duplicate: true },
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
      assert(name === "finish_invitation_delivery", "finish RPC");
      finishes.push(args);
      stored.set(String(args.p_id), {
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
              throw Error("provider secret/password must never escape");
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
    handler,
    finishes,
    sends: () => sends,
    reservations: () => reservations,
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
      if (name === "invitation_delivery_targets") {
        assert(args.p_event === event, "scoped target lookup");
        return { data: ids, error: null };
      }
      if (name === "finish_invitation_delivery") {
        return {
          data: null,
          error: null,
        };
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
          f.finishes[0].p_status === (accepted ? "sent" : "failed"),
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
