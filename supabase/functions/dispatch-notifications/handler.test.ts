import { dispatchHandler } from "./index.ts";
import { service } from "../_shared/http.ts";
import { type Delivery, DisabledProvider } from "../_shared/providers.ts";
const event = "00000000-0000-4000-8000-000000000001";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
function fixture(consent = true, mode = "sent", admin = true, worker = false) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  let sent = 0;
  const job = {
    id: "job",
    event_id: event,
    guest_id: "guest",
    message_id: "message",
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
        ? { content: "Recado" }
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
          Promise.resolve({ data: [], error: null }).then(resolve),
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
const request = () =>
  new Request("https://fixture.test", {
    method: "POST",
    body: JSON.stringify({ event_id: event }),
  });
Deno.test("ADMIN dispatch claims only authorized event and does not run global scheduling", async () => {
  const f = fixture();
  const result = await (await f.handler(request())).json();
  assert(
    f.calls.length === 1 && f.calls[0].name === "claim_event_notifications" &&
      f.calls[0].args?.p_event === event,
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
