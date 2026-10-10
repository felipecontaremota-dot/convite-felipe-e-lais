import { dispatchHandler } from "./index.ts";
import { service } from "../_shared/http.ts";
import { type Delivery, DisabledProvider } from "../_shared/providers.ts";
const event = "00000000-0000-4000-8000-000000000001";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
function fixture(
  consent = true,
  mode = "sent",
  admin = true,
  worker = false,
  missing = false,
) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  let sent = 0;
  const job = {
    id: "job",
    event_id: event,
    guest_id: "guest",
    message_id: "11111111-1111-4111-8111-111111111111",
    channel: "EMAIL",
    idempotency_key: "stable",
    rule_id: null,
  };
  const db = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name.startsWith("claim_") ? [job] : null, error: null };
    },
    from: (table: string) => {
      const row = table === "guest_contacts"
        ? { consent_email: consent, email: "guest@example.test" }
        : table === "messages"
        ? (missing
          ? null
          : { id: "11111111-1111-4111-8111-111111111111", content: "Recado" })
        : {};
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        upsert: () => chain,
        insert: () => chain,
        single: async () => ({ data: row, error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: table === "notification_jobs"
              ? [{
                channel: "EMAIL",
                status: !consent || mode === "disabled"
                  ? "skipped"
                  : mode === "failed"
                  ? "failed"
                  : "sent",
              }]
              : [],
            error: null,
          }).then(resolve),
      };
      return chain;
    },
  } as unknown as ReturnType<typeof service>;
  const handler = dispatchHandler({
    service: () => db,
    workerAuthorized: () => worker,
    eventAdmin: async (_r, e) => {
      assert(e === event, "authorized event");
      if (!admin) throw Error("unauthorized");
    },
    provider: () =>
      mode === "disabled" ? new DisabledProvider("email") : {
        send: async (d: Delivery) => {
          assert(d.key === "stable", "stable provider key");
          sent++;
          if (mode === "failed") throw Error("sensitive");
          return { status: "sent" as const, provider: "resend" };
        },
      },
  });
  return { handler, calls, sent: () => sent };
}
const request = (message: unknown = "11111111-1111-4111-8111-111111111111") =>
  new Request("https://fixture.test", {
    method: "POST",
    body: JSON.stringify({ event_id: event, message_id: message }),
  });
Deno.test("ADMIN dispatch claims only authorized event and does not run global scheduling", async () => {
  const f = fixture();
  const result = await (await f.handler(request())).json();
  assert(
    f.calls.length === 1 && f.calls[0].name === "claim_event_notifications" &&
      f.calls[0].args?.p_event === event &&
      f.calls[0].args?.p_message === "11111111-1111-4111-8111-111111111111",
    "event isolated",
  );
  assert(
    result.sent === 1 && result.results[0].status === "sent",
    "accepted email",
  );
});
Deno.test("ordinary messages keep consent; absent provider skipped; failures not marked sent", async () => {
  for (
    const [consent, mode, status] of [[false, "sent", "skipped"], [
      true,
      "disabled",
      "skipped",
    ], [true, "failed", "failed"]] as const
  ) {
    const f = fixture(consent, mode);
    const result = await (await f.handler(request())).json();
    assert(
      result.sent === 0 && result.results[0].status === status,
      "honest outcome",
    );
    if (!consent) assert(f.sent() === 0, "no provider without consent");
    assert(!JSON.stringify(result).includes("sensitive"), "sanitized output");
  }
});
Deno.test("non ADMIN cannot claim jobs; secret worker retains scheduling and original claim", async () => {
  const denied = fixture(true, "sent", false);
  assert(
    (await denied.handler(request())).status === 403 &&
      denied.calls.length === 0,
    "deny before DB",
  );
  const worker = fixture(true, "sent", false, true);
  await worker.handler(request());
  assert(
    worker.calls.map((c) => c.name).join(",") ===
      "schedule_notifications,claim_notifications",
    "scheduler preserved",
  );
});

Deno.test("ADMIN requires a valid message belonging to its event before claiming any jobs", async () => {
  for (const id of [undefined, null, "", "not-a-uuid"]) {
    const f = fixture();
    assert(
      (await f.handler(request(id === undefined ? null : id))).status === 400,
      "invalid or absent ID rejected",
    );
    assert(f.calls.length === 0 && f.sent() === 0, "zero jobs claimed or sent");
  }
  const missingId = fixture();
  assert(
    (await missingId.handler(
      new Request("https://fixture.test", {
        method: "POST",
        body: JSON.stringify({ event_id: event }),
      }),
    )).status === 400,
    "omitted message_id rejected",
  );
  assert(
    missingId.calls.length === 0 && missingId.sent() === 0,
    "missing message_id claims zero jobs",
  );
  const absent = fixture(true, "sent", true, false, true);
  assert(
    (await absent.handler(request())).status === 400,
    "wrong event or absent message rejected",
  );
  assert(
    absent.calls.length === 0 && absent.sent() === 0,
    "lookup rejection does not claim jobs",
  );
});
