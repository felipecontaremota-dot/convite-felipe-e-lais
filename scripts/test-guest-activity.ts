// Disposable PostgreSQL only; historical recovery is checked before new writes.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-activity");
    const f = ticketFixture(db);
    const old = f.action("GUEST_RSVP_SET", {
      id: f.a.id,
      status: "MAYBE",
      expected_status: "CONFIRMED",
      expected_responded_at: null,
    });
    assert.equal(old.ok, true);
    f.action("GUEST_RSVP_SET", {
      id: f.b.id,
      status: "MAYBE",
      expected_status: "CONFIRMED",
      expected_responded_at: null,
    });
    db.sql(
      `insert into audit_logs(event_id,actor,action,entity,entity_id,created_at) values('${f.event}','${f.owner}','ACTIVATION','invitations','${f.family.id}','2026-10-01T12:00:00Z');`,
    );
    // Explicit unique actor/event/timestamp evidence recovers a replaced RSVP ID.
    const orphan = randomUUID();
    db.sql(`insert into public.audit_logs(id,event_id,actor,entity,entity_id,action,metadata,created_at) values
      ('${orphan}','${f.event}','${f.admin}','rsvps','${randomUUID()}','UPDATE','{}','2026-10-02T12:00:00Z'),
      ('${randomUUID()}','${f.event}','${f.admin}','guests','${f.individual.id}','GUEST_RSVP_SET','{"previous":"PENDING","next":"DECLINED"}','2026-10-02T12:00:00Z');`);
    const digest = () =>
      db
        .sql(
          "select md5(jsonb_agg(to_jsonb(a) order by id)::text) from audit_logs a where entity <> 'guest_activity'",
        )
        .trim();
    const before = digest();
    const sql = readFileSync(
      `supabase/migrations/${readdirSync("supabase/migrations").find((f) => f.endsWith("_guest_activity_history.sql"))!}`,
      "utf8",
    );
    db.sql(sql.replace(/commit;\s*$/, "rollback;"));
    assert.equal(
      db
        .sql(
          "select to_regprocedure('public.guest_activity_history(uuid,timestamptz,uuid)') is null",
        )
        .trim(),
      "t",
    );
    assert.equal(digest(), before);
    db.sql(sql);
    assert.equal(
      digest(),
      before,
      "migration must not rewrite original historical data",
    );
    assert.equal(
      db.sql("select guest_activity_private.recover_history()").trim(),
      "0",
      "historical recovery must be idempotent",
    );
    const history = (uid = f.admin, cursor?: { at: string; id: string }) =>
      db.rpc(uid, "guest_activity_history", {
        p_event: f.event,
        p_before: cursor?.at,
        p_cursor: cursor?.id,
      });
    let items = history().items;
    const recoveredOrphan = items.find((a: any) => a.id === orphan);
    assert.equal(recoveredOrphan.guest_id, f.individual.id);
    assert.equal(recoveredOrphan.status, "DECLINED");
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where created_at='2026-10-02T12:00:00Z'`,
        )
        .trim(),
      "1",
    );
    const legacy = items.filter(
      (a: any) => a.guest_id === f.a.id && a.status === "MAYBE",
    );
    assert.equal(
      legacy.length,
      1,
      "deduplicate exact administrative/raw RSVP evidence",
    );
    assert.equal(legacy[0].actor_role, "ADMIN");
    assert.equal(legacy[0].historical, true);
    assert.equal(legacy[0].access_mode, null);
    const activation = items.find(
      (a: any) => a.created_at === "2026-10-01T12:00:00+00:00",
    );
    assert.equal(activation.kind, "LOGIN");
    assert.equal(activation.guest_id, null);
    assert.equal(activation.device, null);
    assert.equal(activation.ip, null);
    assert.equal(activation.access_mode, null);
    for (const uid of [f.staff, f.owner, f.stranger])
      assert.throws(() => history(uid), /unauthorized/);
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','public.guest_activity_history(uuid,timestamptz,uuid)','EXECUTE')",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('authenticated','public.redeem_invitation_tracked(uuid,uuid,text,text,text,text,text,inet,boolean,uuid)','EXECUTE')",
        )
        .trim(),
      "f",
    );
    assert.throws(
      () =>
        db.sql(
          "set role authenticated; select * from guest_activity_private.history",
        ),
      /permission denied/,
    );
    assert.throws(
      () =>
        db.sql(
          `set role authenticated; insert into public.audit_logs(event_id,action,entity) values('${f.event}','x','guest_activity')`,
        ),
      /permission denied/,
    );
    assert.throws(
      () =>
        db.sql(
          `set role authenticated; update public.audit_logs set metadata='{}'`,
        ),
      /permission denied/,
    );
    assert.throws(
      () => db.sql("set role authenticated; delete from public.audit_logs"),
      /permission denied/,
    );
    for (const uid of [f.owner, f.staff])
      assert.equal(
        db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';select count(*) from public.audit_logs;commit;`,
          )
          .trim(),
        "0",
        "RLS must protect the underlying store",
      );
    const record = (kind: string, request = randomUUID(), uid = f.owner) =>
      db.rpc(uid, "record_guest_activity", {
        p_event: f.event,
        p_kind: kind,
        p_request: request,
      });
    for (const kind of [
      "PRESENTES",
      "CONVITES",
      "LOCAL",
      "INFORMACOES",
      "LOGOUT",
    ])
      assert.equal(record(kind).recorded, true);
    assert.throws(() => record("PROFILE"), /invalid activity/);
    assert.throws(() => record("LOCAL", randomUUID(), f.staff), /unauthorized/);
    const request = randomUUID();
    assert.equal(record("LOCAL", request).recorded, true);
    assert.equal(record("LOCAL", request).duplicate, true);
    const contextual = randomUUID();
    db.sql(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${f.owner}';set local request.headers='{"user-agent":"Mozilla iPhone OS","x-real-ip":"192.0.2.66","x-forwarded-for":"2001:db8::1"}';select public.record_guest_activity('${f.event}','PRESENTES','${contextual}');commit;`,
    );
    let contextRow = history().items.find(
      (a: any) =>
        a.id ===
        db
          .sql(
            `select id from audit_logs where metadata->>'request_id'='${contextual}'`,
          )
          .trim(),
    );
    assert.equal(contextRow.device, "iPhone");
    assert.equal(
      contextRow.ip,
      null,
      "unverified client IP headers are never evidence",
    );
    // New RSVP state changes are atomic and distinct from note-only/no-op writes.
    const statuses = ["CONFIRMED", "DECLINED", "PENDING"];
    for (const status of statuses) {
      const mutation = randomUUID();
      const args = {
        p_event: f.event,
        p_mutation: mutation,
        p_type: "RSVP_UPDATE",
        p_payload: { guest_id: f.a.id, status },
      };
      db.rpc(f.owner, "app_mutate", args);
      db.rpc(f.owner, "app_mutate", args);
    }
    items = history().items.filter(
      (a: any) => a.kind === "RSVP" && !a.historical && a.guest_id === f.a.id,
    );
    assert.equal(items.length, 3);
    assert.deepEqual(
      new Set(items.map((a: any) => a.status)),
      new Set(["CONFIRMED", "DECLINED", "MAYBE"]),
    );
    assert(
      items.every(
        (a: any) => a.actor_guest_id === f.a.id && a.actor_role === "GUEST",
      ),
    );
    db.rpc(f.owner, "app_mutate", {
      p_event: f.event,
      p_mutation: randomUUID(),
      p_type: "RSVP_UPDATE",
      p_payload: { guest_id: f.a.id, status: "PENDING", note: "Note only" },
    });
    assert.equal(
      history().items.filter(
        (a: any) => a.kind === "RSVP" && !a.historical && a.guest_id === f.a.id,
      ).length,
      3,
    );
    const bstatus = db
      .sql(
        `select status||':'||coalesce(responded_at::text,'') from rsvps where guest_id='${f.b.id}'`,
      )
      .trim();
    db.rpc(f.owner, "app_mutate", {
      p_event: f.event,
      p_mutation: randomUUID(),
      p_type: "RSVP_UPDATE",
      p_payload: { guest_id: f.b.id, status: "DECLINED" },
    });
    const familyChange = history().items.find(
      (a: any) => a.guest_id === f.b.id && !a.historical,
    );
    assert.equal(familyChange.actor_guest_id, f.a.id);
    assert.equal(familyChange.guest_name, f.b.name);
    assert(bstatus.startsWith("PENDING"));
    // Four real events: the legacy update with unknown status, old admin MAYBE,
    // new family DECLINED, and new admin CONFIRMED. Deletion must retain each once.
    const beforeDeleteRsvp = db
      .rpc(f.admin, "app_snapshot", { p_event: f.event })
      .rsvps.find((r: any) => r.guest_id === f.b.id);
    db.sql(`insert into public.profiles(id,display_name) values('${f.admin}','Noivos do teste');
      insert into public.invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id,activity_access_mode) values('${f.event}','${f.admin}','${f.family.id}',now(),'${f.a.id}','NAME_PIN');`);
    f.action("GUEST_RSVP_SET", {
      id: f.b.id,
      status: "CONFIRMED",
      expected_status: beforeDeleteRsvp.status,
      expected_responded_at: beforeDeleteRsvp.responded_at,
    });
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where guest_id='${f.b.id}' and kind='RSVP'`,
        )
        .trim(),
      "4",
    );
    assert.equal(
      history().items.find(
        (a: any) =>
          a.guest_id === f.b.id && a.actor_role === "ADMIN" && !a.historical,
      ).actor_name,
      "Noivos do teste",
    );
    assert.equal(
      history().items.find(
        (a: any) =>
          a.guest_id === f.b.id && a.actor_role === "ADMIN" && !a.historical,
      ).access_mode,
      null,
      "an ADMIN action must not inherit a former guest login mode",
    );
    const changedCount = history().items.length;
    assert.throws(
      () =>
        db.rpc(f.stranger, "app_mutate", {
          p_event: f.event,
          p_mutation: randomUUID(),
          p_type: "RSVP_UPDATE",
          p_payload: { guest_id: f.a.id, status: "DECLINED" },
        }),
      /unauthorized/,
    );
    assert.equal(history().items.length, changedCount);
    db.sql(`delete from public.guests where id='${f.b.id}';`);
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where guest_id='${f.b.id}' and kind='RSVP'`,
        )
        .trim(),
      "4",
      "deletion must not duplicate the old or new administrative audit pair",
    );
    const deleted = history().items.find((a: any) => a.id === familyChange.id);
    assert.equal(deleted.editable, false);
    assert.equal(deleted.guest_name, f.b.name);
    // Login uses canonical creation/PIN and binds real responsible, never roster order.
    const code = db
      .rpc(f.admin, "app_snapshot", { p_event: f.event })
      .invitations.find((i: any) => i.id === f.family.id).sharing_code;
    const tracked = (
      codeValue: string | null,
      name: string | null,
      pin: string,
      ip: string | null,
    ) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role service_role;select public.redeem_invitation_tracked('${f.event}','${f.owner}',${codeValue ? `'${codeValue}'` : "null"},${name ? `'${name}'` : "null"},'${pin}','fixture','Mozilla Windows NT',${ip ? `'${ip}'::inet` : "null"});commit;`,
          )
          .trim() || "null",
      );
    const wrong = tracked(code, null, "9999", null);
    assert.equal(wrong, null);
    assert.equal(tracked(code, null, "1234", "2001:db8::1").linked, true);
    let login = history().items.find(
      (a: any) => a.kind === "LOGIN" && !a.historical,
    );
    assert.equal(login.access_mode, "LINK");
    assert.equal(login.device, "Microsoft Windows");
    assert.equal(login.ip, "2001:db8::1");
    assert.equal(tracked(null, f.a.name, "1234", "192.0.2.10").linked, true);
    login = history().items.find(
      (a: any) => a.kind === "LOGIN" && !a.historical,
    );
    assert.equal(login.access_mode, "NAME_PIN");
    assert.equal(login.ip, "192.0.2.10");
    assert.equal(
      db
        .sql(
          `select activity_access_mode from invitation_sessions where user_id='${f.owner}' and event_id='${f.event}'`,
        )
        .trim(),
      "NAME_PIN",
    );
    assert.equal(
      db
        .sql(
          `select status from guest_activity_private.history where id='${legacy[0].id}'`,
        )
        .trim(),
      "MAYBE",
      "recovered status must survive later RSVP changes",
    );
    // Count original ACTIVITY activations once, including legacy unknown ones.
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where kind='LOGIN' and event_id='${f.event}'`,
        )
        .trim(),
      "3",
    );
    // A verified exclusive link can resume without PIN. Preview alone is not a login.
    const visit = randomUUID();
    for (let i = 0; i < 2; i++) {
      const resumed = JSON.parse(
        db
          .sql(
            `begin;set local role service_role;select redeem_invitation_tracked('${f.event}','${f.owner}','${code}',null,null,'resume-fixture','iPad',null,true,'${visit}');commit;`,
          )
          .trim(),
      );
      assert.equal(resumed.activated, true);
    }
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where kind='LOGIN' and event_id='${f.event}'`,
        )
        .trim(),
      "4",
    );
    const deniedPreview = JSON.parse(
      db
        .sql(
          `begin;set local role service_role;select redeem_invitation_tracked('${f.event}','${f.stranger}','${code}',null,null,'resume-fixture','iPad',null,true,'${randomUUID()}');commit;`,
        )
        .trim(),
    );
    assert.equal(deniedPreview.activated, false);
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where kind='LOGIN' and event_id='${f.event}'`,
        )
        .trim(),
      "4",
    );
    assert.throws(
      () =>
        db.rpc(f.admin, "guest_activity_history", { p_event: randomUUID() }),
      /unauthorized/,
    );
    assert.throws(
      () =>
        db.rpc(f.owner, "record_guest_activity", {
          p_event: randomUUID(),
          p_kind: "LOCAL",
          p_request: randomUUID(),
        }),
      /unauthorized/,
    );
    // Two legitimate redemptions in one transaction must reference their own
    // activation, not choose an arbitrary UUID from a shared timestamp.
    db.sql(`begin;set local role service_role;
      select public.redeem_invitation_tracked('${f.event}','${f.owner}','${code}',null,'1234','transaction-fixture',null,null);
      select public.redeem_invitation_tracked('${f.event}','${f.owner}','${code}',null,'1234','transaction-fixture',null,null);
      commit;`);
    assert.equal(
      db
        .sql(
          `select count(*) from guest_activity_private.history where kind='LOGIN' and event_id='${f.event}'`,
        )
        .trim(),
      "6",
    );
    // Concurrent reprocessing is serialized and idempotent.
    const sameRequest = randomUUID();
    const input = `begin;set local role authenticated;set local request.jwt.claim.sub='${f.owner}';select public.record_guest_activity('${f.event}','LOCAL','${sameRequest}');commit;`;
    const parallel = () =>
      new Promise<void>((resolve, reject) => {
        const child = db.ci
          ? spawn("sudo", [
              "-u",
              "postgres",
              "psql",
              "-d",
              db.name,
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ])
          : spawn("docker", [
              "exec",
              "-i",
              db.name,
              "psql",
              "-h",
              "127.0.0.1",
              "-U",
              "postgres",
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ]);
        let err = "";
        child.stderr.on("data", (d) => (err += d));
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(Error(err)),
        );
        child.stdin.end(input);
      });
    await Promise.all([parallel(), parallel()]);
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where metadata->>'request_id'='${sameRequest}'`,
        )
        .trim(),
      "1",
    );
    for (let i = 0; i < 32; i++) record(i % 2 ? "LOCAL" : "PRESENTES");
    let next: { at: string; id: string } | undefined;
    const all: any[] = [];
    do {
      const page = history(f.admin, next);
      assert(page.items.length <= 20);
      all.push(...page.items);
      next = page.next || undefined;
    } while (next);
    assert.equal(all.length, new Set(all.map((a) => a.id)).size);
    assert(all.length > 40);
    for (let i = 1; i < all.length; i++)
      assert(new Date(all[i - 1].created_at) >= new Date(all[i].created_at));
    const metadata = db.sql(
      "select metadata::text from audit_logs where entity='guest_activity'",
    );
    assert(!/p_pin|p_code|token|whatsapp|email/.test(metadata));
    assert.equal(
      db.sql("select guest_activity_private.device('unknown') is null").trim(),
      "t",
    );
    for (const pair of [
      ["iPad", "iPad"],
      ["Android 13 Pixel", "Android"],
      ["Linux", "Linux"],
      ["Macintosh", "macOS"],
    ])
      assert.equal(
        db.sql(`select guest_activity_private.device('${pair[0]}')`).trim(),
        pair[1],
      );
    assert.equal(
      db.sql("select guest_activity_private.recover_history()").trim(),
      "0",
      "later edits and deletion must not reimport an administrative companion",
    );
    console.log(
      "Guest activity: incremental install/rollback, unchanged historical store, historical recovery/deduplication, RSVP/auth/family/identity, failed writes, role denial, IP/device minimization, pagination, concurrency and audit preservation passed.",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
