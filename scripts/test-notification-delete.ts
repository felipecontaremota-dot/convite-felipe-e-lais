// Isolated database only. No production records or delivery providers are used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
const db = new TestPostgres(),
  q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
async function main() {
  try {
    await db.start("pre-notification-delete");
    const f = ticketFixture(db);
    const action = (user: string, type: string, payload: object) =>
      db.rpc(user, "admin_action", {
        p_event: f.event,
        p_action: type,
        p_payload: payload,
      });
    const pub = (channels = ["IN_APP"]) => {
      const id = randomUUID();
      action(f.admin, "NOTIFICATION_PUBLISH", {
        id,
        audience: "GENERAL",
        title: "Publicação SQL",
        body: "Parágrafos\n\nPreservados.",
        channels,
      });
      return id;
    };
    const first = pub(["EMAIL"]),
      keep = pub();
    const privateMessage = db.rpc(f.admin, "app_mutate", {
      p_event: f.event,
      p_mutation: randomUUID(),
      p_type: "MESSAGE_SEND_TO_GUESTS",
      p_payload: {
        content: "Private message preserved",
        recipient_guest_ids: [f.a.id],
        channels: ["IN_APP"],
        audience: "INDIVIDUAL",
      },
    }).id;
    db.rpc(f.owner, "app_mutate", {
      p_event: f.event,
      p_mutation: randomUUID(),
      p_type: "MESSAGE_READ",
      p_payload: { id: first },
    });
    const original = db.sql(
      `select md5(jsonb_build_object('guests',(select jsonb_agg(to_jsonb(g) order by id) from guests g),'rsvps',(select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r),'qr',(select jsonb_agg(to_jsonb(c) order by id) from qr_credentials c),'checkins',(select jsonb_agg(to_jsonb(c) order by id) from checkins c))::text);`,
    );
    const migration = readFileSync(
      "supabase/migrations/20261025201300_notification_soft_delete.sql",
      "utf8",
    );
    db.sql(migration.replace(/^commit;$/m, "rollback;"));
    assert.equal(
      db
        .sql(
          "select to_regprocedure('notification_private.claim_visible(uuid,uuid,integer)') is null;",
        )
        .trim(),
      "t",
    );
    db.sql(migration);
    const as = (uid: string, expr: string) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub=${q(uid)};select to_jsonb(${expr});commit;`,
          )
          .trim(),
      );
    const service = (expr: string) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role service_role;select to_jsonb(${expr});commit;`,
          )
          .trim(),
      );
    const feed = (uid = f.owner, before?: string, id?: string) =>
      db.rpc(uid, "notification_feed", {
        p_event: f.event,
        p_before: before,
        p_id: id,
      });
    assert.throws(() =>
      as(f.admin, `admin_action('${f.event}',null,'{"id":"${first}"}')`),
    );
    const remove = (id: string, user = f.admin) =>
      action(user, "NOTIFICATION_DELETE", { id });
    for (const uid of [f.owner, f.staff, f.stranger, randomUUID()])
      assert.throws(() => remove(first, uid));
    assert.throws(() =>
      action(f.admin, "NOTIFICATION_DELETE", { id: privateMessage }),
    );
    assert.throws(() =>
      db.rpc(f.admin, "admin_action", {
        p_event: randomUUID(),
        p_action: "NOTIFICATION_DELETE",
        p_payload: { id: first },
      }),
    );
    const jobs = JSON.parse(
      db
        .sql(
          `select json_agg(j order by id) from notification_jobs j where message_id='${first}';`,
        )
        .trim(),
    );
    db.sql(
      `update notification_jobs set status='processing',attempts=1,locked_at=clock_timestamp(),delivery_started_at=clock_timestamp() where id='${jobs[0].id}';update notification_jobs set status='processing',attempts=1,locked_at=clock_timestamp() where id='${jobs[1].id}';insert into delivery_attempts(event_id,job_id,status,provider) values('${f.event}','${jobs[2].id}','failed','fixture');`,
    );
    const published = db.sql(
      `select published_at from messages where id='${first}';`,
    );
    const result = remove(first);
    assert(result.deleted_at);
    assert.deepEqual(remove(first).deleted_at, result.deleted_at);
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where action='NOTIFICATION_DELETE' and entity_id='${first}';`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db.sql(`select published_at from messages where id='${first}';`),
      published,
    );
    assert.equal(
      db
        .sql(
          `select count(*) from notification_jobs where message_id='${first}' and status='skipped';`,
        )
        .trim(),
      "2",
    );
    assert.equal(
      db
        .sql(`select status from notification_jobs where id='${jobs[0].id}';`)
        .trim(),
      "processing",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from delivery_attempts where job_id='${jobs[2].id}';`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db
        .sql(`select count(*) from message_reads where message_id='${first}';`)
        .trim(),
      "1",
    );
    assert.deepEqual(
      feed().map((p: { id: string }) => p.id),
      [keep],
    );
    assert(!feed(f.secondDevice).some((p: { id: string }) => p.id === first));
    const historical = feed(f.admin).find(
      (p: { id: string }) => p.id === first,
    );
    assert.equal(historical.deleted_by, f.admin);
    assert.equal(historical.deleted_at, result.deleted_at);
    assert.equal(
      as(f.owner, `(select count(*) from public.messages where id='${first}')`),
      0,
    );
    assert.throws(() =>
      db.rpc(f.owner, "app_mutate", {
        p_event: f.event,
        p_mutation: randomUUID(),
        p_type: "MESSAGE_READ",
        p_payload: { id: first },
      }),
    );
    assert(
      service(
        `(select count(*) from claim_event_notifications('${f.event}',50,'${first}'))`,
      ) === 0,
    );
    assert.equal(
      db
        .sql(`select content from messages where id='${privateMessage}';`)
        .trim(),
      "Private message preserved",
    );
    assert.equal(
      service(
        `(select count(*) from claim_event_notifications('${f.event}',50,'${privateMessage}'))`,
      ),
      1,
    );
    // A replay cannot restore the deleted publication or enqueue it again.
    action(f.admin, "NOTIFICATION_PUBLISH", {
      id: first,
      audience: "GENERAL",
      title: "Replay",
      body: "Do not restore",
      channels: ["EMAIL"],
    });
    assert.equal(feed().length, 1);
    const asyncSql = (sql: string) =>
      new Promise<string>((resolve, reject) => {
        const args = db.ci
          ? [
              "-u",
              "postgres",
              "psql",
              "-d",
              db.name,
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ]
          : [
              "exec",
              "-i",
              db.name,
              "psql",
              "-U",
              "postgres",
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ];
        const child = spawn(db.ci ? "sudo" : "docker", args);
        let out = "",
          err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("exit", (code) =>
          code === 0 ? resolve(out) : reject(Error(err)),
        );
        child.stdin.end(sql);
      });
    const deleteSql = (id: string) =>
      `set local role authenticated;set local request.jwt.claim.sub='${f.admin}';select admin_action('${f.event}','NOTIFICATION_DELETE','{"id":"${id}"}');`;
    // Two independent removals produce one tombstone and one audit event.
    const concurrent = pub();
    await Promise.all([
      asyncSql(`begin;${deleteSql(concurrent)}select pg_sleep(0.2);commit;`),
      asyncSql(`begin;${deleteSql(concurrent)}commit;`),
    ]);
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where action='NOTIFICATION_DELETE' and entity_id='${concurrent}';`,
        )
        .trim(),
      "1",
    );
    db.sql(
      `update events set notification_email_enabled=true;insert into guest_contacts(event_id,guest_id,email,consent_email) values('${f.event}','${f.a.id}','fixture@example.test',true) on conflict(guest_id) do update set email=excluded.email,consent_email=true;`,
    );
    const admissionFixture = () => {
      const id = pub(["EMAIL"]);
      const job = JSON.parse(
        db
          .sql(
            `update notification_jobs set status='processing',attempts=1,locked_at=clock_timestamp() where message_id='${id}' and guest_id='${f.a.id}' returning row_to_json(notification_jobs);`,
          )
          .trim(),
      );
      const args = `'${f.event}','${job.id}','${f.a.id}','EMAIL',1,'${job.locked_at}',true`;
      return { id, job, args };
    };
    const waitFence = async (key: number) => {
      for (let n = 0; n < 100; n++) {
        if (db.sql(`select pg_try_advisory_lock(${key});`).trim() === "f")
          return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error("Concurrent transaction did not reach its fence");
    };
    for (const role of ["anon", "authenticated"])
      assert.equal(
        db
          .sql(
            `select has_function_privilege('${role}','notification_private.claim_visible(uuid,uuid,integer)','EXECUTE');`,
          )
          .trim(),
        "f",
      );
    // Deletion wins: worker waits for the same guest lock, then cannot admit any delivery.
    const d = admissionFixture();
    const deleting = asyncSql(
      `begin;${deleteSql(d.id)}select pg_advisory_xact_lock(894001);select pg_sleep(1.5);commit;`,
    );
    await waitFence(894001);
    const denied = asyncSql(
      `begin;set local role service_role;select authorize_notification_attempt(${d.args});commit;`,
    );
    const [, denyResult] = await Promise.all([deleting, denied]);
    assert.equal(JSON.parse(denyResult.trim()).authorized, false);
    // Admission wins: already admitted work is retained; no new admission after deletion.
    const a = admissionFixture();
    const admitting = asyncSql(
      `begin;set local role service_role;select authorize_notification_attempt(${a.args});select pg_advisory_xact_lock(894002);select pg_sleep(1.5);commit;`,
    );
    await waitFence(894002);
    await Promise.all([admitting, asyncSql(`begin;${deleteSql(a.id)}commit;`)]);
    assert.equal(
      db
        .sql(
          `select delivery_started_at is not null from notification_jobs where id='${a.job.id}';`,
        )
        .trim(),
      "t",
    );
    assert.equal(
      service(`authorize_notification_attempt(${a.args})`).authorized,
      false,
    );
    const token = db
      .sql(
        `select delivery_started_at from notification_jobs where id='${a.job.id}';`,
      )
      .trim();
    assert.equal(
      service(
        `finish_notification_attempt('${f.event}','${a.job.id}',1,'${a.job.locked_at}','sent','fixture','accepted','${token}')`,
      ),
      true,
    );
    // Claim racing deletion never makes the tombstone retryable.
    const race = pub(["EMAIL"]);
    await Promise.all([
      asyncSql(
        `begin;set local role service_role;select count(*) from claim_notifications(50);commit;`,
      ),
      asyncSql(`begin;${deleteSql(race)}commit;`),
    ]);
    assert.equal(
      service(
        `(select count(*) from claim_event_notifications('${f.event}',50,'${race}'))`,
      ),
      0,
    );
    const rule = randomUUID();
    db.sql(
      `update events set notification_scheduling_enabled=true,starts_at=now()+interval '99 days';insert into notification_rules(id,event_id,days_before,title,body,channels) values('${rule}','${f.event}',99,'Automatic','Body','{IN_APP}');select schedule_notifications();`,
    );
    const automatic = db
      .sql(`select id from messages where notification_rule_id='${rule}';`)
      .trim();
    remove(automatic);
    db.sql("select schedule_notifications();");
    assert.equal(
      db
        .sql(
          `select count(*) from messages where notification_rule_id='${rule}';`,
        )
        .trim(),
      "1",
    );
    // Pagination excludes deleted rows; administrator history retains them.
    db.sql(
      `insert into messages(event_id,thread_id,from_admin,content,notification_title,audience,published_at,notification_origin) select '${f.event}',(select id from message_threads limit 1),true,'Page body','Page '||n,'GENERAL',now()+n*interval '1 second','MANUAL' from generate_series(1,25)n;`,
    );
    const page = feed(),
      last = page[19],
      older = feed(f.owner, last.published_at, last.id);
    assert.equal(page.length, 20);
    assert(
      ![...page, ...older].some((p: { id: string }) =>
        [first, concurrent, d.id, a.id, race, automatic].includes(p.id),
      ),
    );
    assert(
      db.rpc(f.owner, "app_snapshot", { p_event: f.event })
        .notification_feed_revision >= 6,
    );
    assert.equal(
      db.sql(
        `select md5(jsonb_build_object('guests',(select jsonb_agg(to_jsonb(g) order by id) from guests g),'rsvps',(select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r),'qr',(select jsonb_agg(to_jsonb(c) order by id) from qr_credentials c),'checkins',(select jsonb_agg(to_jsonb(c) order by id) from checkins c))::text);`,
      ),
      original,
    );
    console.log(
      "Notification deletion: upgrade/rollback, RLS, preserved history, pagination, automatic replay, claim races and both admission/delete orders PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e.stderr || e);
  process.exitCode = 1;
});
