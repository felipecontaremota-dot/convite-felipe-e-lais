import { dispatchHandler } from "./index.ts";
import { ProviderDefinitiveError, ProviderUncertainError, service } from "../_shared/http.ts";
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
  channel = "EMAIL",
  revoked = false,
  scheduled = false,
) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  let sent = 0;
  const payloads: Delivery[] = [];
  const job = {
    id: "job",
    attempts: 1,
    locked_at: "2026-10-12T00:00:00Z",
    event_id: event,
    guest_id: "guest",
    message_id: "11111111-1111-4111-8111-111111111111",
    channel,
    idempotency_key: "stable",
    rule_id: mode === "rule" ? "rule" : null,
  };
  const db = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "authorize_notification_attempt") return { data: {
        authorized: consent && !revoked && !(mode === "revoked_before_start" && args?.p_start),
        reason: "consent",
        admission: args?.p_start ? "2026-10-12T00:00:01Z" : null,
      }, error: null };
      if (name === "finish_notification_attempt") return { data: true, error: null };
      return { data: name.startsWith("claim_") ? [job] : null, error: null };
    },
    from: (table: string) => {
      const row = table === "guest_contacts"
        ? {
          communications_revoked: revoked,
          consent_email: consent, consent_whatsapp: consent,
          consent_push: consent, consent_in_app: consent,
          email: "guest@example.test",
        }
        : table === "notification_rules" ? { id: "rule", title: "Aviso", body: "Recado" }
        : table === "guests" ? { invitation_id: "unit" }
        : table === "message_threads" ? { id: "thread" }
        : table === "messages"
        ? (missing
          ? null
          : { id: "11111111-1111-4111-8111-111111111111", content: scheduled ? "Título programado\nCorpo programado" : "Recado", ...(scheduled ? {notification_title:"Título programado"} : {}) })
        : {};
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
          calls.push({ name: "write:" + table, args: { payload, options } });
          return chain;
        },
        insert: () => chain,
        single: async () => ({ data: row, error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: table === "notification_jobs"
              ? [{
                channel: "EMAIL",
                status: !consent || revoked || mode === "revoked_before_start" || mode === "disabled"
                  ? "skipped"
                  : mode === "failed"
                  ? "failed"
                  : mode === "uncertain" ? "uncertain"
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
          payloads.push(d);
          if (mode === "failed") throw new ProviderDefinitiveError(401);
          if (mode === "uncertain") throw new ProviderUncertainError();
          return { status: "sent" as const, provider: "resend" };
        },
      },
  });
  return { handler, calls, payloads, sent: () => sent };
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
    f.calls.filter((c) => c.name.startsWith("claim_")).length === 1 && f.calls[0].name === "claim_event_notifications" &&
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
    worker.calls.filter((c) => !c.name.endsWith("notification_attempt")).map((c) => c.name).join(",") ===
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

Deno.test("revocation prevents all four channels from invoking providers", async () => {
  for (const channel of ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"]) {
    const f = fixture(true, "sent", true, true, false, channel, true);
    const result = await (await f.handler(new Request("https://fixture.test", {
      method: "POST", body: "{}",
    }))).json();
    assert(
      f.sent() === 0 && result.skipped === 1,
      `revoked ${channel} never delivered`,
    );
  }
});
Deno.test("reactivated channel consent permits normal delivery again", async () => {
  for (const channel of ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"]) {
    const f = fixture(true, "sent", true, true, false, channel);
    const result = await (await f.handler(new Request("https://fixture.test", {
      method: "POST", body: "{}",
    }))).json();
    assert(result.sent === 1, `reactivated ${channel} delivered`);
    assert(f.sent() === (channel === "IN_APP" ? 0 : 1), "expected provider calls");
  }
});

Deno.test(
  "revocation between loading content and final admission prevents provider invocation",
  async () => {
    const f = fixture(true, "revoked_before_start");
    const result = await (await f.handler(request())).json();
    assert(
      f.sent() === 0 && result.skipped === 1,
      "zero provider POSTs after revocation",
    );
    const admissions = f.calls.filter(
      (c) => c.name === "authorize_notification_attempt",
    );
    assert(
      admissions.length === 2 &&
        admissions[0].args?.p_start === false &&
        admissions[1].args?.p_start === true,
      "final revalidation",
    );
  },
);
Deno.test(
  "timeout after provider admission is recorded uncertain, never failed or automatically resent",
  async () => {
    const f = fixture(true, "uncertain");
    const result = await (await f.handler(request())).json();
    assert(
      f.sent() === 1 && result.uncertain === 1 && result.failed === 0,
      "honest outcome",
    );
    assert(
      f.calls.some(
        (c) =>
          c.name === "finish_notification_attempt" &&
          c.args?.p_status === "uncertain",
      ),
      "SQL keeps uncertainty",
    );
  },
);

for (const channel of ["EMAIL","PUSH","WHATSAPP"]) {
 Deno.test(`scheduled ${channel} keeps title and body without changing legacy contracts`,async()=>{
  const f=fixture(true,"sent",true,false,false,channel,false,true);
  await f.handler(request());
  assert(f.sent()===1,"one provider call");
  assert(f.payloads[0].title==="Título programado","configured notification title");
  assert(f.payloads[0].body===(channel==="WHATSAPP"?"Título programado\nCorpo programado":"Corpo programado"),"compatible body for the channel");
 });
}

Deno.test("relative IN_APP rules register the exact recipient idempotently", async () => {
  const f = fixture(true, "rule", true, true, false, "IN_APP");
  await f.handler(request());
  const writes = f.calls.filter(c => c.name === "write:message_recipients");
  assert(writes.length === 1, "one scoped recipient upsert");
  assert(JSON.stringify(writes[0].args?.payload) === JSON.stringify({ event_id: event, message_id: "job", guest_id: "guest" }), "recipient bound to the job, guest and event");
  assert((writes[0].args?.options as Record<string, unknown>)?.onConflict === "message_id,guest_id", "stable recipient conflict key");
});
