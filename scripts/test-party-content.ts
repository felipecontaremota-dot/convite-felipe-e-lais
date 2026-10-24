// Disposable PostgreSQL only. No production connection or real guest mutations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-party-content");
    const f = ticketFixture(db);
    const old = db.rpc(f.admin, "wedding_party_admin_save_details", {
      p_event: f.event,
      p_guest: f.a.id,
      p_role: "PADRINHO",
      p_expected_cycle: null,
      p_message: "Carta anterior",
      p_expected_message: null,
      p_display_name: "Meu amigo",
      p_expected_display_name: null,
    });
    db.rpc(f.owner, "wedding_party_respond", {
      p_event: f.event,
      p_cycle: old.cycle_id,
      p_action: "ACCEPT",
    });
    db.rpc(f.owner, "wedding_party_respond", {
      p_event: f.event,
      p_cycle: old.cycle_id,
      p_action: "COMPLETE",
    });
    const before = db.rpc(f.admin, "wedding_party_admin_get", {
      p_event: f.event,
      p_guest: f.a.id,
    });
    const policies = () =>
      db.sql(
        "select md5(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text) from pg_policies p;",
      );
    const snapshot = () =>
      db.rpc(f.admin, "app_snapshot", { p_event: f.event });
    const originalSnapshot = snapshot(),
      originalPolicies = policies();
    db.sql(
      readFileSync(
        "supabase/migrations/20261024215704_wedding_party_couples_note.sql",
        "utf8",
      ),
    );
    const after = db.rpc(f.admin, "wedding_party_admin_get", {
      p_event: f.event,
      p_guest: f.a.id,
    });
    assert.equal(after.couples_note, null);
    delete after.couples_note;
    assert.deepEqual(after, before);
    assert.deepEqual(snapshot(), originalSnapshot);
    assert.equal(policies(), originalPolicies);
    const params = {
      p_event: f.event,
      p_guest: f.a.id,
      p_role: "PADRINHO",
      p_expected_cycle: old.cycle_id,
      p_message: "Carta anterior",
      p_expected_message: "Carta anterior",
      p_display_name: "Meu amigo",
      p_expected_display_name: "Meu amigo",
      p_note: "Primeiro parágrafo 💙\n\nSegundo <script>texto literal</script>",
      p_expected_note: null,
    };
    const save = (user: string, args = params) =>
      db.rpc(user, "wedding_party_admin_save_content", args);
    for (const user of [
      f.owner,
      f.secondDevice,
      f.staff,
      f.stranger,
      randomUUID(),
    ])
      assert.throws(() => save(user));
    assert.throws(() => save(f.admin, { ...params, p_event: randomUUID() }));
    assert.throws(() =>
      save(f.admin, { ...params, p_note: "x".repeat(12001) }),
    );
    const saved = save(f.admin);
    assert.equal(saved.couples_note, params.p_note);
    assert.equal(saved.personal_message, before.personal_message);
    assert.equal(saved.display_name, before.display_name);
    assert.equal(saved.cycle_id, before.cycle_id);
    assert.equal(saved.accepted_at, before.accepted_at);
    assert.equal(saved.completed_at, before.completed_at);
    for (const uid of [f.owner, f.secondDevice])
      assert.equal(
        db.rpc(uid, "wedding_party_state", { p_event: f.event }).promotion
          .couples_note,
        params.p_note,
      );
    assert.throws(() =>
      save(f.admin, { ...params, p_message: "stale letter" }),
    );
    assert.equal(
      db.rpc(f.admin, "wedding_party_admin_get", {
        p_event: f.event,
        p_guest: f.a.id,
      }).personal_message,
      "Carta anterior",
    );
    // Legacy letter/nickname editors must leave the independent note intact.
    const legacyEdit = db.rpc(f.admin, "wedding_party_admin_save_details", {
      p_event: f.event,
      p_guest: f.a.id,
      p_role: "PADRINHO",
      p_expected_cycle: old.cycle_id,
      p_message: "Carta anterior",
      p_expected_message: "Carta anterior",
      p_display_name: "Meu amigo",
      p_expected_display_name: "Meu amigo",
    });
    assert.equal(legacyEdit.couples_note, params.p_note);
    assert.throws(() =>
      save(f.admin, {
        ...params,
        p_message: "",
        p_expected_note: params.p_note,
      } as typeof params),
    );
    assert.equal(
      db.rpc(f.admin, "wedding_party_admin_get", {
        p_event: f.event,
        p_guest: f.a.id,
      }).couples_note,
      params.p_note,
    );
    const other = db.rpc(f.admin, "wedding_party_admin_save_content", {
      ...params,
      p_guest: f.b.id,
      p_role: "MADRINHA",
      p_expected_cycle: null,
      p_message: "Outra carta",
      p_expected_message: null,
      p_display_name: "Amiga",
      p_expected_display_name: null,
      p_note: "Somente para B",
      p_expected_note: null,
    });
    assert.notEqual(saved.cycle_id, other.cycle_id);
    assert.ok(
      !JSON.stringify(
        db.rpc(f.owner, "wedding_party_state", { p_event: f.event }),
      ).includes("Somente para B"),
    );
    db.sql(
      `update invitation_sessions set profile_guest_id='${f.b.id}' where user_id='${f.secondDevice}';`,
    );
    const stateB = db.rpc(f.secondDevice, "wedding_party_state", {
      p_event: f.event,
    });
    assert.equal(stateB.promotion.couples_note, "Somente para B");
    assert.ok(!JSON.stringify(stateB).includes(params.p_note));
    assert.ok(
      !JSON.stringify(
        db.rpc(f.owner, "app_snapshot", { p_event: f.event }),
      ).includes("Somente para B"),
    );
    assert.equal(
      db.rpc(f.stranger, "wedding_party_state", { p_event: f.event }).promotion,
      null,
    );
    assert.throws(() =>
      db.sql(
        "begin;set local role authenticated;select couples_note from wedding_party_private.promotions;commit;",
      ),
    );
    // Explicit clearing is allowed; a stale editor cannot overwrite it.
    const clear = save(f.admin, {
      ...params,
      p_note: "   ",
      p_expected_note: params.p_note,
    } as typeof params);
    assert.equal(clear.couples_note, null);
    assert.throws(() =>
      save(f.admin, {
        ...params,
        p_expected_note: params.p_note,
      } as typeof params),
    );
    assert.equal(policies(), originalPolicies);
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','public.wedding_party_admin_save_content(uuid,uuid,text,uuid,text,text,text,text,text,text)','EXECUTE');",
        )
        .trim(),
      "f",
    );
    assert.ok(
      !db
        .sql("select jsonb_agg(to_jsonb(a)) from audit_logs a;")
        .includes(params.p_note),
    );
    console.log(
      "Party content: legacy upgrade, independent fields, unchanged lifecycle/RLS/snapshot, two devices, family isolation, denied roles/events/direct access, literal paragraphs, stale-write rollback, clear and audit passed.",
    );
  } finally {
    db.stop();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
