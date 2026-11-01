// Disposable PostgreSQL only; never creates promotions or messages in production.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
import type { Promotion } from "../src/features/weddingParty/types";
const db = new TestPostgres();
async function main() {
  try {
    await db.start();
    const f = ticketFixture(db);
    const original = readFileSync(
      "supabase/migrations/20261019232846_wedding_party_letters.sql",
      "utf8",
    );
    const oldFunction = original
      .slice(
        original.indexOf("create function public.wedding_party_admin_save("),
        original.indexOf(
          "revoke all on function public.wedding_party_admin_save(",
        ),
      )
      .replace("create function", "create or replace function");
    db.sql(oldFunction);
    const quote = (v: unknown) =>
      v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
    const save = (
      guest: string,
      message: string | null,
      current: Partial<Promotion> | null = null,
      note: string | null = "Recado preservado",
      user = f.admin,
      event = f.event,
    ) =>
      JSON.parse(
        db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub=${quote(user)};select public.wedding_party_admin_save_content(${[event, guest, current?.role || "PADRINHO", current?.cycle_id, message, current?.personal_message, "Meu amigo", current?.display_name, note, current?.couples_note].map(quote).join(",")});commit;`,
          )
          .trim(),
      );
    const existing = save(f.a.id, "Trecho anterior\n\nSegundo parágrafo");
    db.rpc(f.owner, "wedding_party_respond", {
      p_event: f.event,
      p_cycle: existing.cycle_id,
      p_action: "ACCEPT",
    });
    db.rpc(f.owner, "wedding_party_respond", {
      p_event: f.event,
      p_cycle: existing.cycle_id,
      p_action: "COMPLETE",
    });
    assert.throws(() => save(f.a.id, "", existing));
    const metadata = () =>
      db.sql(
        "select jsonb_build_object('oid',p.oid,'acl',p.proacl,'owner',p.proowner,'config',p.proconfig,'definer',p.prosecdef)::text from pg_proc p where oid='public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text)'::regprocedure",
      );
    const wrappers = () =>
      db.sql(
        "select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),',' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_snapshot','app_mutate','admin_action','wedding_party_admin_save_details','wedding_party_admin_save_content','wedding_party_admin_set','wedding_party_state')",
      );
    const policies = () =>
      db.sql(
        "select md5(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text) from pg_policies p",
      );
    const rows = () =>
      db.sql(
        "select md5(string_agg(t::text,',' order by t::text)) from (select to_jsonb(p)::text t from wedding_party_private.promotions p union all select to_jsonb(g)::text from guests g union all select to_jsonb(r)::text from rsvps r union all select to_jsonb(q)::text from qr_credentials q union all select to_jsonb(c)::text from checkins c union all select to_jsonb(a)::text from audit_logs a) x",
      );
    const before = {
      metadata: metadata(),
      wrappers: wrappers(),
      policies: policies(),
      rows: rows(),
    };
    const filename = readdirSync("supabase/migrations").find((n) =>
      n.endsWith("_optional_party_excerpt.sql"),
    )!;
    const migration = readFileSync(`supabase/migrations/${filename}`, "utf8");
    db.sql(migration.replace(/^commit;$/m, "rollback;"));
    assert.throws(() => save(f.a.id, "", existing));
    db.sql(migration);
    assert.deepEqual(
      {
        metadata: metadata(),
        wrappers: wrappers(),
        policies: policies(),
        rows: rows(),
      },
      before,
    );
    const cleared = save(f.a.id, "", existing);
    assert.equal(cleared.personal_message, null);
    assert.equal(cleared.couples_note, existing.couples_note);
    assert.equal(cleared.cycle_id, existing.cycle_id);
    assert.ok(cleared.accepted_at && cleared.completed_at);
    assert.throws(() => save(f.a.id, "stale", existing));
    const filled = save(
      f.a.id,
      "  Trecho completo\n\n<script>texto literal</script>  ",
      cleared,
    );
    assert.equal(
      filled.personal_message,
      "  Trecho completo\n\n<script>texto literal</script>  ",
    );
    assert.throws(() => save(f.a.id, "x".repeat(12001), filled));
    assert.throws(() => save(f.a.id, " ".repeat(12001), filled));
    for (const [index, message] of [null, "", " \n\t"].entries()) {
      const guest = db.rpc(f.admin, "admin_action", {
        p_event: f.event,
        p_action: "GUEST_CREATE",
        p_payload: { name: `Pessoa trecho ${index}` },
      });
      const role = index % 2 ? "MADRINHA" : "PADRINHO";
      const created = save(guest.id, message, { role });
      assert.equal(created.role, role);
      assert.equal(created.personal_message, null);
      assert.equal(created.couples_note, "Recado preservado");
      assert.ok(created.cycle_id);
      const changedNote = save(
        guest.id,
        "",
        created,
        "Recado alterado sem trecho",
      );
      assert.equal(changedNote.personal_message, null);
      assert.equal(changedNote.couples_note, "Recado alterado sem trecho");
      const clearedNote = save(guest.id, "", changedNote, "");
      assert.equal(clearedNote.couples_note, null);
    }
    for (const user of [f.owner, f.staff, f.stranger])
      assert.throws(() => save(f.a.id, "", filled, "Recado preservado", user));
    assert.throws(() =>
      save(
        f.a.id,
        "",
        filled,
        "Recado preservado",
        f.admin,
        "00000000-0000-4000-8000-000000000999",
      ),
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text)','EXECUTE')",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('authenticated','public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text)','EXECUTE')",
        )
        .trim(),
      "t",
    );
    assert.ok(
      Number(
        db
          .sql(
            "select count(*) from audit_logs where action='WEDDING_PARTY_MESSAGE_UPDATE'",
          )
          .trim(),
      ) > 0,
    );
    console.log(
      "Optional excerpt: old rejection reproduced; upgrade/rollback, preserved OID/ACL/RLS/wrappers/rows, NULL/empty/whitespace promotion, filled/cleared excerpt, unchanged couples-note rules, lifecycle, stale writes, authorization and audit PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
