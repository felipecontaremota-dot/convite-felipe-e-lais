// All writes and privilege probes are confined to a disposable PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { TestPostgres } from "./postgres";
export async function verifyCheckinRoleUpgrade() {
  const db = new TestPostgres();
  try {
    await db.start("pre-checkin-actor-role");
    const event = "00000000-0000-4000-8000-000000000001";
    const admin = randomUUID(),
      staff = randomUUID(),
      otherEvent = randomUUID();
    db.sql(`insert into auth.users(id) values('${admin}'),('${staff}');
      insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST');
      insert into events(id,title,starts_at) values('${otherEvent}','Other event',now());
      insert into user_roles(event_id,user_id,role) values('${otherEvent}','${staff}','ADMIN');`);
    const guest = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Historical operator fixture" },
    });
    db.sql(`update rsvps set status='CONFIRMED' where guest_id='${guest.id}';`);
    const mutate = (uid: string, type: string, payload: object) =>
      db.rpc(uid, "app_mutate", {
        p_event: event,
        p_mutation: randomUUID(),
        p_type: type,
        p_payload: payload,
      });
    const entry = mutate(admin, "CHECKIN_CREATE", {
      guest_id: guest.id,
      method: "MANUAL",
    });
    mutate(staff, "CHECKIN_REVERT", { id: entry.id });
    mutate(staff, "CHECKIN_CREATE", { guest_id: guest.id, method: "MANUAL" });
    const history = () =>
      db.rpc(admin, "app_snapshot", { p_event: event })
        .checkin_history as Record<string, unknown>[];
    const beforeHistory = history();
    const data = () =>
      [
        "guests",
        "invitations",
        "rsvps",
        "checkins",
        "qr_credentials",
        "audit_logs",
        "mutation_receipts",
        "user_roles",
        "auth.users",
      ].map((t) =>
        db
          .sql(
            `select md5(coalesce(jsonb_agg(j order by j::text),'[]'::jsonb)::text) from (select to_jsonb(r) j from ${t} r)s;`,
          )
          .trim(),
      );
    const catalog = () =>
      db.sql(
        `select jsonb_agg(jsonb_build_object('oid',p.oid,'acl',p.proacl,'owner',p.proowner,'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile) order by p.oid) from pg_proc p where p.oid in ('ceremonial_private.checkin_history(uuid)'::regprocedure,'public.app_snapshot(uuid)'::regprocedure,'public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'public.admin_action(uuid,text,jsonb)'::regprocedure);`,
      );
    const policies = () =>
      db.sql(
        "select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p;",
      );
    const publicBodies = () =>
      db.sql(
        "select jsonb_agg(md5(prosrc) order by proname) from pg_proc where oid in ('public.app_snapshot(uuid)'::regprocedure,'public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'public.admin_action(uuid,text,jsonb)'::regprocedure);",
      );
    const before = {
      data: data(),
      catalog: catalog(),
      policies: policies(),
      bodies: publicBodies(),
    };
    db.sql(
      readFileSync(
        "supabase/migrations/20261024004410_checkin_history_actor_role.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      {
        data: data(),
        catalog: catalog(),
        policies: policies(),
        bodies: publicBodies(),
      },
      before,
    );
    const after = history();
    assert.deepEqual(
      after.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => key !== "actor_role"),
        ),
      ),
      beforeHistory,
    );
    assert.equal(after.filter((r) => r.actor_role === "ADMIN").length, 1);
    assert.equal(
      after.filter((r) => r.actor_role === "CEREMONIALIST").length,
      2,
    );
    assert.equal(after.find((r) => r.action === "REMOVAL")?.actor_id, staff);
    // Repeated same-event links cannot multiply results, even if a future schema
    // removes today's uniqueness constraint. Conflicting roles fail closed.
    // sql() opens its own connection, so keep each hypothetical fixture in one transaction.
    const repeat = (role: string) =>
      JSON.parse(
        db
          .sql(
            `begin; alter table user_roles drop constraint user_roles_event_id_user_id_key;
      insert into user_roles(event_id,user_id,role) values('${event}','${staff}','${role}');
      select ceremonial_private.checkin_history('${event}'); rollback;`,
          )
          .trim(),
      ) as Record<string, unknown>[];
    assert.equal(repeat("CEREMONIALIST").length, after.length);
    assert.ok(
      repeat("CEREMONIALIST")
        .filter((r) => r.actor_id === staff)
        .every((r) => r.actor_role === "CEREMONIALIST"),
    );
    assert.ok(
      repeat("ADMIN")
        .filter((r) => r.actor_id === staff)
        .every((r) => r.actor_role === null),
    );
    assert.equal(
      db
        .sql(
          `begin;set local role authenticated;set local request.jwt.claim.sub='${staff}';select count(*) from public.user_roles where event_id='${event}';rollback;`,
        )
        .trim(),
      "0",
    );
    // A role in a different event must not identify this event's operator.
    db.sql(
      `delete from user_roles where event_id='${event}' and user_id='${staff}';`,
    );
    assert.ok(
      history()
        .filter((r) => r.actor_id === staff)
        .every((r) => r.actor_role === null),
    );
    assert.equal(history().length, after.length);
    assert.equal(
      db
        .sql(
          `select has_function_privilege('authenticated','ceremonial_private.checkin_history(uuid)','EXECUTE') or has_function_privilege('anon','ceremonial_private.checkin_history(uuid)','EXECUTE');`,
        )
        .trim(),
      "f",
    );
    console.log(
      "History roles: historical entry/removal, role isolation, absent/conflicting/repeated links, unchanged rows/OIDs/ACL/RLS/public RPCs passed.",
    );
  } finally {
    db.stop();
  }
}
