// Disposable DB only. Dates are controlled relative to the database clock.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
const q = (s: unknown) => `'${String(s).replaceAll("'", "''")}'`;
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-reminder");
    const f = ticketFixture(db);
    const old = db.sql(
      "select md5(jsonb_agg(to_jsonb(g) order by id)::text) from guests g;",
    );
    const file = readdirSync("supabase/migrations").find((f) =>
      f.endsWith("_ten_day_email_reminder.sql"),
    )!;
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    db.sql(sql.replace(/commit;\s*$/, "rollback;"));
    assert.equal(
      db
        .sql(
          "select to_regclass('notification_private.ten_day_campaigns') is null",
        )
        .trim(),
      "t",
    );
    db.sql(sql);
    assert.equal(
      db.sql(
        "select md5(jsonb_agg(to_jsonb(g) order by id)::text) from guests g;",
      ),
      old,
    );
    const admin = (action = "READ", payload = {}) =>
      db.rpc(f.admin, "ten_day_email_admin", {
        p_event: f.event,
        p_action: action,
        p_payload: payload,
      });
    const work = (
      action: string,
      args: { event?: string; job?: any; payload?: object } = {},
    ) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role service_role;select ten_day_email_work(${q(action)},${q(args.event || f.event)}::uuid,${args.job ? q(args.job.id) : "null"}::uuid,${args.job ? args.job.attempts : "null"},${args.job ? q(args.job.locked_at) : "null"}::timestamptz,${q(JSON.stringify(args.payload || {}))}::jsonb);commit;`,
          )
          .trim(),
      );
    let c = admin();
    assert.equal(c.enabled, false);
    assert.equal(
      c.subject,
      "FALTAM APENAS 10 DIAS PARA O NOSSO CASAMENTO 💙💍",
    );
    assert.equal(
      new Date(c.scheduled_at).toISOString(),
      "2026-12-05T19:00:00.000Z",
    );
    for (const uid of [f.staff, f.owner, f.stranger, randomUUID()])
      assert.throws(() =>
        db.rpc(uid, "ten_day_email_admin", { p_event: f.event }),
      );
    assert.throws(() =>
      db.sql(`set role anon;select ten_day_email_admin('${f.event}');`),
    );
    assert.throws(() =>
      db.sql(`set role authenticated;select ten_day_email_work('DUE');`),
    );
    assert.throws(() =>
      db.sql(
        "set role authenticated;select * from notification_private.ten_day_campaigns",
      ),
    );
    assert.throws(() => admin("SAVE", { ...c, body: "missing placeholders" }));
    // Move event relative to the clock, not the actual wedding calendar.
    db.sql(
      `update events set starts_at=clock_timestamp()+interval '11 days' where id='${f.event}';`,
    );
    c = admin("SAVE", { ...c, enabled: true });
    assert.deepEqual(work("DUE"), []);
    db.sql(
      `update events set starts_at=clock_timestamp()+interval '10 days'-interval '1 minute' where id='${f.event}';`,
    );
    assert.equal(work("DUE").length, 1);
    assert.equal(
      work("PREPARE").prepared,
      false,
      "missing artwork never dispatches",
    );
    work("IMAGE", { payload: { available: false } });
    work("BLOCK");
    assert.deepEqual(work("DUE"), []);
    work("IMAGE", { payload: { available: true } });
    c = admin();
    c = admin("RESUME", { version: c.version });
    db.sql(
      `insert into guest_contacts(event_id,guest_id,email) values('${f.event}','${f.a.id}','shared@example.test'),('${f.event}','${f.b.id}','shared@example.test') on conflict(guest_id) do update set email=excluded.email;update rsvps set status='DECLINED' where guest_id='${f.b.id}';`,
    );
    // RSVP changed before scheduling: latest CONFIRMED governs selection, not old estimate.
    db.sql(`update rsvps set status='CONFIRMED' where guest_id='${f.b.id}';`);
    assert.equal(work("PREPARE").prepared, true);
    assert.equal(work("PREPARE").prepared, false);
    c = admin();
    assert.equal(c.counts.pending, 2);
    assert.equal(c.counts.skipped, 1);
    assert.equal(
      db
        .sql(
          "select count(*) from messages where notification_origin is not null",
        )
        .trim(),
      "0",
    );
    const claims = () =>
      JSON.parse(
        db
          .sql(
            "begin;set local role service_role;select coalesce(jsonb_agg(j),'[]') from claim_notifications(50) j;commit;",
          )
          .trim(),
      );
    let jobs = claims();
    assert.equal(
      jobs.length,
      2,
      "same e-mail must NOT merge individual guests",
    );
    const a = jobs.find((j: any) => j.guest_id === f.a.id),
      b = jobs.find((j: any) => j.guest_id === f.b.id);
    const data = work("PEEK", { job: a });
    assert.equal(data.email, "shared@example.test");
    assert.equal(data.name, f.a.name);
    assert.equal(data.pin, "1234");
    assert(data.code);
    // Changes immediately before admission are rechecked.
    db.sql(`update rsvps set status='DECLINED' where guest_id='${f.b.id}';`);
    assert.equal(work("PEEK", { job: b }).ready, false);
    assert.equal(
      work("START", { job: a, payload: { hash: "a".repeat(64) } }).ready,
      true,
    );
    assert.equal(
      work("START", { job: a, payload: { hash: "a".repeat(64) } }).ready,
      false,
      "one admission",
    );
    // Simulate lost provider response/crash. The shared queue must never auto-reclaim it.
    db.sql(
      `update notification_jobs set locked_at=clock_timestamp()-interval '11 minutes' where id='${a.id}';`,
    );
    assert.equal(claims().length, 0);
    assert.equal(admin().counts.uncertain, 1);
    c = admin();
    admin("RETRY", { version: c.version });
    assert.equal(claims().length, 0);
    assert.throws(() => admin("SAVE", { ...c, subject: "different" }));
    assert.equal(
      db
        .sql("select count(*) from notification_private.ten_day_context")
        .trim(),
      "1",
    );
    assert.equal(
      db
        .sql(
          "select count(*) from information_schema.columns where table_schema='notification_private' and table_name='ten_day_context' and column_name in ('pin','code','password')",
        )
        .trim(),
      "0",
    );
    // Unknown test outcomes are persistent reservations, without guest jobs/credentials.
    const request = randomUUID();
    assert.equal(
      work("TEST_RESERVE", { payload: { actor: f.admin, request } }).reserved,
      true,
    );
    assert.equal(
      work("TEST_RESERVE", { payload: { actor: f.admin, request } }).reserved,
      false,
    );
    assert.throws(() =>
      work("TEST_RESERVE", {
        payload: { actor: f.staff, request: randomUUID() },
      }),
    );
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='ten_day_test' and metadata::text ~ '(1234|sharing_code)'`,
        )
        .trim(),
      "0",
    );
    // Separate guests, concurrent admissions and shared safe receipt handling.
    db.sql(
      `update guest_contacts set email='individual@example.test' where guest_id='${f.individual.id}';update notification_jobs set status='pending',next_attempt_at=now() where guest_id='${f.individual.id}' and ten_day_campaign_id='${c.id}';`,
    );
    const individual = claims()[0];
    assert(individual);
    work("PEEK", { job: individual });
    const source = `begin;set local role service_role;select ten_day_email_work('START','${f.event}','${individual.id}',${individual.attempts},'${individual.locked_at}','{"hash":"${"b".repeat(64)}"}');commit;`;
    const execute = promisify(execFile);
    const parallel = () =>
      execute(
        db.ci ? "sudo" : "docker",
        db.ci
          ? [
              "-u",
              "postgres",
              "psql",
              "-d",
              db.name,
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
              "-c",
              source,
            ]
          : [
              "exec",
              db.name,
              "psql",
              "-U",
              "postgres",
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
              "-c",
              source,
            ],
      );
    const admitted = await Promise.all([parallel(), parallel()]);
    const outcomes = admitted.map((r) => JSON.parse(r.stdout.trim()));
    assert.equal(outcomes.filter((r) => r.ready).length, 1);
    const admission = outcomes.find((r) => r.ready).admission;
    assert.equal(
      db
        .sql(
          `begin;set local role service_role;select finish_notification_attempt('${f.event}','${individual.id}',${individual.attempts},'${individual.locked_at}','failed','resend',null,'${admission}');commit;`,
        )
        .trim(),
      "t",
    );
    db.sql(
      `update notification_jobs set next_attempt_at=now() where id='${individual.id}';`,
    );
    const retry = claims()[0];
    assert(retry);
    work("PEEK", { job: retry });
    assert.equal(
      work("START", { job: retry, payload: { hash: "c".repeat(64) } }).ready,
      false,
      "same key never accepts changed payload",
    );
    db.sql(
      `update rsvps set status='CONFIRMED' where guest_id='${f.b.id}';update notification_jobs set status='pending',next_attempt_at=now() where id='${b.id}';`,
    );
    const success = claims()[0];
    work("PEEK", { job: success });
    const accepted = work("START", {
      job: success,
      payload: { hash: "d".repeat(64) },
    });
    assert.equal(
      db
        .sql(
          `begin;set local role service_role;select finish_notification_attempt('${f.event}','${success.id}',${success.attempts},'${success.locked_at}','sent','resend','test-provider-id','${accepted.admission}');commit;`,
        )
        .trim(),
      "t",
    );
    assert.equal(admin().counts.sent, 1);
    assert.equal(claims().length, 0);
    const late = randomUUID();
    db.sql(
      `insert into events(id,title,starts_at,timezone) values('${late}','Relative test event',clock_timestamp()+interval '10 days'-interval '2 hours','America/Sao_Paulo');insert into user_roles(event_id,user_id,role) values('${late}','${f.admin}','ADMIN');`,
    );
    const lateAdmin = (action = "READ", payload = {}) =>
      db.rpc(f.admin, "ten_day_email_admin", {
        p_event: late,
        p_action: action,
        p_payload: payload,
      });
    const lateConfig = lateAdmin();
    assert.equal(lateConfig.enabled, false);
    assert.throws(() => lateAdmin("SAVE", { ...lateConfig, enabled: true }));
    db.sql(
      `update notification_private.ten_day_campaigns set enabled=true where event_id='${late}';`,
    );
    work("DUE");
    assert.equal(
      lateAdmin().state,
      "blocked",
      "late campaign requires explicit ADMIN action",
    );
    work("IMAGE", { event: late, payload: { available: true } });
    lateAdmin("RESUME", { version: lateAdmin().version });
    assert(work("DUE").some((x: any) => x.event_id === late));
    // Existing notification rules, RSVP and QR algorithms are not replaced.
    assert.equal(db.sql("select count(*) from notification_rules").trim(), "9");
    assert.equal(db.sql("select count(*) from rsvps").trim(), "3");
    console.log(
      "Ten-day reminder: incremental rollback/integrity, derived time, dynamic RSVP, private ADMIN configuration, missing artwork/manual resume, per-guest idempotence, admission, shared receipts, unknown outcome suppression and safe test reservations PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
