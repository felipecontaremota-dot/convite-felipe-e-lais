// Disposable fixtures only. Never connects to production.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
import {
  guestExportRows,
  type GuestExportData,
} from "../src/features/guests/guestExport";
import { filteredGuestExportRows } from "../src/features/guests/guestExportFilters";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start();
    const f = ticketFixture(db);
    const version = db
      .sql(`select version from guests where id='${f.a.id}'`)
      .trim();
    f.action("GUEST_UPDATE", {
      id: f.a.id,
      version: Number(version),
      name: f.a.name,
      group_label: "Familiar da noiva",
      email: "restricted@example.test",
      whatsapp: "62999999999",
      admin_notes: "Fonte única administrativa",
    });
    f.action("GUEST_INVITATION_SENT_SET", {
      id: f.a.id,
      sent: true,
      expected_sent: false,
    });
    // Simulate incremental install/rollback only inside this disposable fixture DB.
    const migration = readFileSync(
      `supabase/migrations/${readdirSync("supabase/migrations").find((f) => f.endsWith("_ceremonial_guest_export.sql"))!}`,
      "utf8",
    );
    db.sql("drop function public.guest_list_export(uuid);");
    db.sql(
      migration
        .replace(/^begin;/, "begin;")
        .replace(/commit;\s*$/, "rollback;"),
    );
    assert.equal(
      db
        .sql(
          "select to_regprocedure('public.guest_list_export(uuid)') is null;",
        )
        .trim(),
      "t",
    );
    db.sql(migration);
    const before = db.sql(
      `select jsonb_build_object('guests',(select md5(jsonb_agg(to_jsonb(g) order by g.id)::text) from guests g),'rsvp',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from rsvps r),'checkins',(select count(*) from checkins),'credentials',(select count(*) from qr_credentials),'audits',(select count(*) from audit_logs));`,
    );
    const exported = db.rpc(f.staff, "guest_list_export", {
      p_event: f.event,
    }) as GuestExportData;
    const admin = db.rpc(f.admin, "app_snapshot", { p_event: f.event });
    assert.equal(exported.role, "CEREMONIALIST");
    assert.equal(exported.contacts.length, 0);
    assert.equal(exported.guests.length, admin.guests.length);
    const forbidden =
      /"(pin|sharing_code|code_hash|token|token_hash|email|whatsapp|admin_notes)"/;
    assert.doesNotMatch(JSON.stringify(exported), forbidden);
    const rows = guestExportRows(exported, "", "ALL", "https://example.test");
    const full = guestExportRows(admin, "", "ALL", "https://example.test");
    for (let i = 0; i < rows.length; i++)
      for (let c = 0; c < 10; c++)
        assert.equal(rows[i]![c], [2, 4, 5, 7].includes(c) ? "" : full[i]![c]);
    assert.equal(
      filteredGuestExportRows(exported, ["Convites enviados"]).length,
      1,
    );
    for (const uid of [f.owner, f.stranger])
      assert.throws(() =>
        db.rpc(uid, "guest_list_export", { p_event: f.event }),
      );
    assert.throws(() =>
      db.rpc(f.staff, "guest_list_export", {
        p_event: "00000000-0000-4000-8000-000000000002",
      }),
    );
    assert.throws(() =>
      db.sql(
        "set role anon; select guest_list_export('00000000-0000-4000-8000-000000000001');",
      ),
    );
    assert.throws(() =>
      db.rpc(f.staff, "admin_action", {
        p_event: f.event,
        p_action: "GUEST_UPDATE",
        p_payload: {
          id: f.a.id,
          version: Number(version) + 1,
          name: "Unauthorized",
          admin_notes: "tampered",
        },
      }),
    );
    const operational = db.rpc(f.staff, "app_snapshot", { p_event: f.event });
    assert.equal(
      operational.guests.find((g: { id: string }) => g.id === f.a.id)
        .admin_notes,
      "Fonte única administrativa",
    );
    assert.equal(operational.contacts.length, 0);
    assert.equal(operational.credentials.length, 0);
    assert.equal(
      db
        .sql(
          `select count(*) from guest_admin_details where guest_id='${f.a.id}' and notes='Fonte única administrativa';`,
        )
        .trim(),
      "1",
    );
    const after = db.sql(
      `select jsonb_build_object('guests',(select md5(jsonb_agg(to_jsonb(g) order by g.id)::text) from guests g),'rsvp',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from rsvps r),'checkins',(select count(*) from checkins),'credentials',(select count(*) from qr_credentials),'audits',(select count(*) from audit_logs));`,
    );
    assert.equal(after, before);
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','public.guest_list_export(uuid)','EXECUTE');",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('authenticated','public.guest_list_export(uuid)','EXECUTE');",
        )
        .trim(),
      "t",
    );
    // Revocation is effective even while the original Auth session still exists.
    db.sql(
      `delete from user_roles where event_id='${f.event}' and user_id='${f.staff}';`,
    );
    assert.throws(() =>
      db.rpc(f.staff, "guest_list_export", { p_event: f.event }),
    );
    console.log(
      "Ceremonial export: redacted payload, column parity, filters, RLS, denied writes, integrity and revoked role passed.",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
