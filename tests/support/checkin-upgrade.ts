// Upgrade/failure checks run only in a disposable PostgreSQL database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { TestPostgres } from "./postgres";
export async function verifyCheckinUpgrade() {
  const db = new TestPostgres();
  try {
    await db.start("pre-checkin-reversal");
    const migration = readFileSync(
      "supabase/migrations/20261023115359_checkin_reversal_history.sql",
      "utf8",
    );
    const catalog = () =>
      db
        .sql(
          `select jsonb_agg(jsonb_build_object('oid',oid,'name',proname,'acl',proacl) order by oid) from pg_proc where oid in ('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'public.app_snapshot(uuid)'::regprocedure,'public.admin_action(uuid,text,jsonb)'::regprocedure);`,
        )
        .trim();
    const originalCatalog = catalog();
    const originalSnapshot = db.sql(
      "select pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure);",
    );
    db.sql(
      "create or replace function public.app_snapshot(p_event uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;",
    );
    assert.throws(() => db.sql(migration), /Reviewed RPC baseline changed/);
    db.sql(originalSnapshot);
    const untouched = () => {
      assert.equal(catalog(), originalCatalog);
      assert.equal(
        db
          .sql(
            "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ceremonial_private' and p.proname='audit_checkin';",
          )
          .trim(),
        "0",
      );
      assert.match(
        db.sql(
          "select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.checkins'::regclass and tgname='audit';",
        ),
        /audit_row\(\)/,
      );
    };
    // An incompatible existing key aborts the whole migration, never removes data.
    db.sql(
      `insert into audit_logs(event_id,action,entity,entity_id,metadata) select '00000000-0000-4000-8000-000000000001','DELETE','checkins',gen_random_uuid(),'{"reversal_mutation_id":"upgrade-duplicate-fixture"}'::jsonb from generate_series(1,2);`,
    );
    assert.throws(() => db.sql(migration), /could not create unique index/);
    untouched();
    db.sql(
      "delete from audit_logs where metadata->>'reversal_mutation_id'='upgrade-duplicate-fixture';",
    );
    // Another connection holds the table. The 3s lock timeout must roll back DDL.
    let ready!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
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
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
          "-qAt",
          "-v",
          "ON_ERROR_STOP=1",
        ];
    const child = spawn(db.ci ? "sudo" : "docker", args);
    const finished = new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (b) => {
        if (String(b).includes("locked")) ready();
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code ? reject(Error("Lock fixture failed")) : resolve(),
      );
    });
    child.stdin.end(
      "begin;lock table public.checkins in access exclusive mode;select 'locked';select pg_sleep(5);commit;",
    );
    await acquired;
    assert.throws(() => db.sql(migration), /lock timeout/);
    await finished;
    untouched();
    const event = "00000000-0000-4000-8000-000000000001",
      admin = "df000000-0000-4000-8000-000000000001";
    db.sql(
      `insert into auth.users(id) values('${admin}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');create function ceremonial_private.unrelated_upgrade_fixture() returns integer language sql as $$ select 1 $$;grant execute on function ceremonial_private.unrelated_upgrade_fixture() to authenticated;`,
    );
    const g = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Existing upgrade fixture" },
    });
    db.sql(`update rsvps set status='CONFIRMED' where guest_id='${g.id}';`);
    db.rpc(admin, "issue_ticket", {
      p_event: event,
      p_guest: g.id,
      p_regenerate: false,
    });
    db.rpc(admin, "app_mutate", {
      p_event: event,
      p_mutation: "df000000-0000-4000-8000-000000000002",
      p_type: "CHECKIN_CREATE",
      p_payload: { guest_id: g.id, method: "MANUAL" },
    });
    const tables = [
      "guests",
      "invitations",
      "rsvps",
      "checkins",
      "qr_credentials",
      "audit_logs",
      "mutation_receipts",
      "sheet_sync_jobs",
      "sheet_jobs",
      "user_roles",
      "auth.users",
    ].filter(
      (t) => db.sql(`select to_regclass('${t}') is not null;`).trim() === "t",
    );
    const contents = () =>
      tables.map((t) =>
        db
          .sql(
            `select md5(coalesce(jsonb_agg(j order by j::text),'[]'::jsonb)::text) from (select to_jsonb(r) j from ${t} r)s;`,
          )
          .trim(),
      );
    const before = contents();
    db.sql(migration);
    assert.deepEqual(
      contents(),
      before,
      "Installation must not modify any existing operational/audit row",
    );
    assert.equal(
      catalog(),
      originalCatalog,
      "Public RPC OIDs/ACLs must be preserved",
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('authenticated','ceremonial_private.unrelated_upgrade_fixture()','EXECUTE');",
        )
        .trim(),
      "t",
    );
    for (const [copy, hash] of [
      ["mutate_before_reversal", "87ec5c5ffca7b6f0f43647f38817f21d"],
      ["snapshot_before_reversal", "2083e77359fcdbdbd09086182b619104"],
      ["admin_before_reversal", "d97c6fc03651ace8d28f8eb19e5d6695"],
    ])
      assert.equal(
        db
          .sql(
            `select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ceremonial_private' and p.proname='${copy}';`,
          )
          .trim(),
        hash,
      );
    assert.equal(
      db
        .sql(
          "select bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ceremonial_private' and p.proname in ('audit_checkin','revert_checkin','checkin_history','mutate_before_reversal','snapshot_before_reversal','admin_before_reversal');",
        )
        .trim(),
      "t",
    );
    console.log(
      "Upgrade: unchanged rows/OIDs/ACLs/delegated bodies; unrelated grant retained; baseline/index/lock failures fully roll back.",
    );
  } finally {
    db.stop();
  }
}
