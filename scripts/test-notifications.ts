// All writes below target a disposable PostgreSQL instance, never production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
const db = new TestPostgres();
const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
async function main() {
  try {
    await db.start("pre-notifications");
    const f = ticketFixture(db);
    const before = db.rpc(f.admin, "app_snapshot", { p_event: f.event });
    const integrity = () =>
      db.sql(
        `select jsonb_build_object('guests',(select count(*) from guests),'rsvps',(select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r),'credentials',(select count(*) from qr_credentials),'checkins',(select count(*) from checkins),'invitations',(select count(*) from invitations));`,
      );
    const old = integrity();
    const migration = readFileSync(
      "supabase/migrations/20261025135720_general_notifications.sql",
      "utf8",
    );
    // Transaction rollback rehearsal, including new wrappers and schema.
    const legacy = randomUUID(),
      thread = randomUUID();
    const rollbackMigration = migration
      .replace(
        "begin;",
        `begin;
      insert into message_threads(id,event_id) values('${thread}','${f.event}');
      insert into messages(id,event_id,thread_id,from_admin,content,audience,created_at) values('${legacy}','${f.event}','${thread}',true,'Legacy exact body','GENERAL','2026-10-20T15:00:00Z');
      insert into announcements(event_id,message_id,title,content,created_at) values('${f.event}','${legacy}','Legacy title','Legacy exact body','2026-10-20T15:00:00Z');`,
      )
      .replace(
        /^commit;$/m,
        () => `do $$begin
      if not exists(select 1 from messages where id='${legacy}' and published_at='2026-10-20T15:00:00Z' and content='Legacy exact body') then raise exception 'legacy publication changed';end if;
      if exists(select 1 from notification_jobs where message_id='${legacy}') then raise exception 'backfill must not enqueue deliveries';end if;
      end$$;rollback;`,
      );
    db.sql(rollbackMigration);
    assert.equal(
      db.sql("select to_regnamespace('notification_private') is null;").trim(),
      "t",
    );
    db.sql(migration);
    assert.equal(integrity(), old);
    const after = db.rpc(f.admin, "app_snapshot", { p_event: f.event });
    assert.deepEqual(after.guests, before.guests);
    assert.deepEqual(after.rsvps, before.rsvps);
    const sqlRpc = (uid: string, expression: string) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub=${q(uid)};select to_jsonb(${expression});commit;`,
          )
          .trim(),
      );
    const action = (uid: string, type: string, p: object) =>
      db.rpc(uid, "admin_action", {
        p_event: f.event,
        p_action: type,
        p_payload: p,
      });
    const publish = (id = randomUUID(), channels = ["IN_APP"]) => ({
      id,
      title: "Recado geral 💙",
      body: "Primeiro parágrafo\n\nSegundo parágrafo.",
      channels,
      audience: "GENERAL",
    });
    const feed = (
      user = f.owner,
      event = f.event,
      before: string | null = null,
      id: string | null = null,
    ) =>
      sqlRpc(
        user,
        `notification_feed(${q(event)}::uuid,${before ? q(before) : "null"}::timestamptz,${id ? q(id) : "null"}::uuid)`,
      );
    const automatic = before.rules[0];
    for (const channels of [[], ["WHATSAPP"], [null]])
      assert.throws(() =>
        action(f.admin, "RULE_SAVE", { ...automatic, channels }),
      );
    assert.throws(() =>
      action(f.admin, "RULE_SAVE", { ...automatic, title: "" }),
    );
    action(f.admin, "RULE_SAVE", {
      ...automatic,
      title: "Edited automatic rule",
    });
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity_id='${automatic.id}' and action='NOTIFICATION_RULE_UPDATED';`,
        )
        .trim(),
      "1",
    );
    const payload = publish();
    for (const uid of [f.owner, f.staff, f.stranger, randomUUID()])
      assert.throws(() => action(uid, "NOTIFICATION_PUBLISH", payload));
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_PUBLISH", {
        ...payload,
        audience: "FAMILY",
      }),
    );
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_PUBLISH", {
        ...payload,
        channels: ["WHATSAPP"],
      }),
    );
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_PUBLISH", {
        ...payload,
        recipient_guest_ids: [f.a.id],
      }),
    );
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_PUBLISH", { ...payload, body: "" }),
    );
    action(f.admin, "NOTIFICATION_PUBLISH", payload);
    action(f.admin, "NOTIFICATION_PUBLISH", payload);
    assert.equal(
      db.sql(`select count(*) from messages where id=${q(payload.id)};`).trim(),
      "1",
    );
    let items = feed();
    assert.equal(items.length, 1);
    assert.equal(items[0].content, payload.body);
    assert(items[0].published_at);
    assert.equal(items[0].origin, "MANUAL");
    assert.deepEqual(feed(f.secondDevice), items);
    assert.throws(() => feed(f.staff));
    assert.throws(() => feed(f.owner, randomUUID()));
    db.rpc(f.owner, "app_mutate", {
      p_event: f.event,
      p_mutation: randomUUID(),
      p_type: "MESSAGE_READ",
      p_payload: { id: payload.id },
    });
    assert(feed(f.secondDevice)[0].viewer_read_at);
    assert.throws(() => action(f.admin, "MESSAGE_DELETE", { id: payload.id }));
    const external = publish(randomUUID(), ["EMAIL", "PUSH"]);
    action(f.admin, "NOTIFICATION_PUBLISH", external);
    assert.equal(feed().length, 2);
    assert.equal(
      db
        .sql(
          `select count(*) from notification_jobs where message_id=${q(external.id)};`,
        )
        .trim(),
      String(after.guests.length * 2),
    );
    // Old RSVP and QR policies remain independent of publication eligibility.
    db.sql(`update rsvps set status='PENDING' where guest_id=${q(f.a.id)};`);
    assert.equal(feed().length, 2);
    const preference = (user: string, action: string, p: object) =>
      sqlRpc(
        user,
        `notification_preferences(${q(f.event)}::uuid,${q(action)},${q(JSON.stringify(p))}::jsonb)`,
      );
    assert.throws(() =>
      preference(f.owner, "EMAIL", {
        guest_id: f.individual.id,
        enabled: true,
      }),
    );
    assert.throws(() =>
      preference(f.owner, "EMAIL", { guest_id: f.a.id, enabled: true }),
    );
    db.sql(
      `insert into guest_contacts(event_id,guest_id,email) values(${q(f.event)},${q(f.a.id)},'fixture@example.test') on conflict(guest_id) do update set email=excluded.email;`,
    );
    preference(f.owner, "EMAIL", { guest_id: f.a.id, enabled: true });
    assert.equal(
      db
        .sql(
          `select consent_email from guest_contacts where guest_id=${q(f.a.id)};`,
        )
        .trim(),
      "t",
    );
    preference(f.owner, "EMAIL", { guest_id: f.a.id, enabled: false });
    assert.throws(() =>
      preference(f.owner, "PUSH_REGISTER", {
        guest_id: f.a.id,
        endpoint: "https://localhost/private",
        p256dh: "x".repeat(87),
        auth: "x".repeat(22),
      }),
    );
    db.sql(
      `update events set notification_push_enabled=true,notification_vapid_public='fixture' where id=${q(f.event)};`,
    );
    assert.throws(() =>
      preference(f.owner, "PUSH_REGISTER", {
        guest_id: f.a.id,
        endpoint: "https://localhost/private",
        p256dh: "x".repeat(87),
        auth: "x".repeat(22),
      }),
    );
    preference(f.owner, "PUSH_REGISTER", {
      guest_id: f.a.id,
      endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
      p256dh: "x".repeat(87),
      auth: "x".repeat(22),
    });
    assert.throws(() =>
      sqlRpc(f.owner, "(select count(*) from web_push_subscriptions)"),
    );
    preference(f.owner, "PUSH_REVOKE", { guest_id: f.a.id });
    assert.equal(
      db
        .sql("select count(*) from web_push_subscriptions where active;")
        .trim(),
      "0",
    );
    const scheduled = {
      ...publish(),
      scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    };
    assert.throws(() => action(f.admin, "NOTIFICATION_SAVE", scheduled));
    db.sql(
      `update events set notification_scheduling_enabled=true where id=${q(f.event)};`,
    );
    action(f.admin, "NOTIFICATION_SAVE", scheduled);
    action(f.admin, "NOTIFICATION_SAVE", scheduled);
    assert(!feed().some((p: { id: string }) => p.id === scheduled.id));
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_SAVE", {
        ...scheduled,
        title: "Concurrent overwrite",
        version: 9,
      }),
    );
    action(f.admin, "NOTIFICATION_SAVE", {
      ...scheduled,
      title: "Edited",
      version: 1,
    });
    action(f.admin, "NOTIFICATION_CANCEL", { id: scheduled.id, version: 2 });
    assert.equal(
      db
        .sql(
          `select status from notification_schedules where id=${q(scheduled.id)};`,
        )
        .trim(),
      "cancelled",
    );
    const due = {
      ...publish(),
      scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    };
    action(f.admin, "NOTIFICATION_SAVE", due);
    db.sql(
      `update notification_schedules set scheduled_at=now()-interval '1 day' where id=${q(due.id)};`,
    );
    const runAsync = promisify(execFile);
    const asyncSql = (sql: string) =>
      runAsync(
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
              sql,
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
              sql,
            ],
      );
    await Promise.all([
      asyncSql("select schedule_notifications();"),
      asyncSql("select schedule_notifications();"),
    ]);
    assert.equal(
      db.sql(`select count(*) from messages where id=${q(due.id)};`).trim(),
      "1",
    );
    assert(feed().some((p: { id: string }) => p.id === due.id));
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_CANCEL", { id: due.id, version: 2 }),
    );
    // Automatic reminders do not run when disabled; expired rules never create a catch-up campaign.
    db.sql(
      `update events set starts_at=now()-interval '2 days',notification_scheduling_enabled=false;select schedule_notifications();`,
    );
    assert.equal(
      db
        .sql(
          "select count(*) from messages where notification_origin='AUTOMATIC';",
        )
        .trim(),
      "0",
    );
    db.sql(
      "update events set notification_scheduling_enabled=true;select schedule_notifications();",
    );
    assert.equal(
      db
        .sql(
          "select count(*) from messages where notification_origin='AUTOMATIC';",
        )
        .trim(),
      "0",
    );
    assert.equal(
      db
        .sql("select count(*) from notification_private.rule_expirations;")
        .trim(),
      "9",
    );
    const rule = randomUUID();
    db.sql(
      `insert into notification_rules(id,event_id,days_before,title,body,channels) values('${rule}','${f.event}',99,'Due rule','Automatic body','{IN_APP}'); update events set starts_at=now()+interval '99 days'; select schedule_notifications();select schedule_notifications();`,
    );
    assert.equal(
      db
        .sql(
          `select count(*) from messages where notification_rule_id='${rule}';`,
        )
        .trim(),
      "1",
    );
    // Pagination: deterministic ties and full content, without channel duplication.
    db.sql(
      `insert into messages(event_id,thread_id,from_admin,content,notification_title,audience,published_at,notification_origin) select '${f.event}',(select id from message_threads limit 1),true,'Body '||n,'Title '||n,'GENERAL',now()+n*interval '1 second','MANUAL' from generate_series(1,25)n;`,
    );
    items = feed();
    assert.equal(items.length, 20);
    const older = feed(f.owner, f.event, items[19].published_at, items[19].id);
    assert(older.length > 0);
    assert(
      !older.some((p: { id: string }) =>
        items.some((i: { id: string }) => i.id === p.id),
      ),
    );
    assert.throws(() => action(f.admin, "NOTIFICATION_PUBLISH", publish()));
    db.sql(`update invitations set active=false where id='${f.family.id}';`);
    assert.throws(() => feed());
    // Public/internal ACL matrix; no escalation through new helpers.
    for (const role of ["anon", "authenticated"])
      assert.equal(
        db
          .sql(
            `select has_function_privilege('${role}','notification_private.publish(uuid,uuid,text,text,delivery_channel[],uuid,text,uuid)','EXECUTE');`,
          )
          .trim(),
        "f",
      );
    // New subscriptions must not block the existing account cleanup lifecycle.
    db.sql(`delete from auth.users where id='${f.owner}';`);
    assert.equal(
      db.sql("select count(*) from web_push_subscriptions;").trim(),
      "0",
    );
    // Contract test of scheduler SQL with local Vault/Cron/HTTP stubs; never sends an HTTP request.
    db.sql(`create schema vault;create schema cron;create schema net;
      create table vault.secrets(id uuid primary key,secret text);
      create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(secret text,name text,description text) returns uuid language plpgsql as $$declare sid uuid:=gen_random_uuid();begin insert into vault.secrets values(sid,$1);return sid;end$$;
      create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true);
      create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
      create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
      create table net.calls(id bigserial,url text);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.calls(url) values($1) returning id$$;`);
    const scheduler = readFileSync(
      "supabase/migrations/20261025135750_notification_scheduler.sql",
      "utf8",
    ).replace(/^create extension.*;$/gm, "");
    db.sql(scheduler);
    assert.equal(
      db
        .sql(
          "select active from cron.job where jobname='wedding-notifications';",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select schedule from cron.job where jobname='wedding-notifications';",
        )
        .trim(),
      "*/5 * * * *",
    );
    db.sql("select notification_private.invoke_worker();");
    assert.equal(db.sql("select count(*) from net.calls;").trim(), "0");
    assert.equal(
      db
        .sql(
          "set role service_role;select notification_worker_authorized('wrong');reset role;",
        )
        .trim(),
      "f",
    );
    assert.throws(() =>
      db.sql(
        "set role authenticated;select notification_worker_authorized('wrong');",
      ),
    );
    assert.equal(
      db
        .sql(
          "select notification_worker_authorized((select decrypted_secret from vault.decrypted_secrets limit 1));",
        )
        .trim(),
      "t",
    );
    db.sql(
      "update notification_private.worker_config set enabled=true,endpoint='https://fixture.supabase.co/functions/v1/dispatch-notifications';select notification_private.invoke_worker();",
    );
    assert.equal(db.sql("select count(*) from net.calls;").trim(), "1");
    console.log(
      "General notifications: upgrade/rollback, publication, SQL/RLS, consent, concurrency, cancellation, automatic expiry and pagination PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e.stderr || e);
  process.exitCode = 1;
});
