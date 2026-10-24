// No production connection: every mutation below uses disposable PostgreSQL.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-ticket-replacement");
    const f = ticketFixture(db),
      { event, staff, owner, secondDevice, stranger, a, b, individual } = f;
    const issue = (uid: string, guest: string) =>
      db.rpc(uid, "issue_ticket", {
        p_event: event,
        p_guest: guest,
        p_regenerate: false,
      });
    const original = issue(owner, a.id),
      otherMember = issue(owner, b.id),
      individualToken = issue(stranger, individual.id);
    const current = (guest: string) =>
      db
        .sql(
          `select id from qr_credentials where guest_id='${guest}' and revoked_at is null;`,
        )
        .trim();
    const expected = current(a.id);
    const data = () =>
      [
        "guests",
        "invitations",
        "rsvps",
        "qr_credentials",
        "checkins",
        "audit_logs",
        "invitation_sessions",
      ].map((t) =>
        db
          .sql(
            `select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from ${t} t;`,
          )
          .trim(),
      );
    const policies = () =>
      db.sql(
        "select md5(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text) from pg_policies p;",
      );
    const legacy = () =>
      db.sql(
        "select pg_get_functiondef('public.issue_ticket(uuid,uuid,boolean)'::regprocedure);",
      );
    const before = { data: data(), policies: policies(), legacy: legacy() };
    db.sql(
      readFileSync(
        "supabase/migrations/20261024052358_replace_ticket_compare_and_swap.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      { data: data(), policies: policies(), legacy: legacy() },
      before,
    );
    const replace = (
      uid: string,
      guest: string,
      id: string | null = expected,
      eventId = event,
    ) =>
      db.rpc(uid, "replace_ticket", {
        p_event: eventId,
        p_guest: guest,
        p_expected_credential: id,
      });
    for (const uid of [staff, stranger, randomUUID()])
      assert.throws(() => replace(uid, a.id), /unauthorized/);
    assert.throws(
      () => replace(owner, individual.id, current(individual.id)),
      /unauthorized/,
    );
    assert.throws(
      () => replace(owner, a.id, expected, randomUUID()),
      /unauthorized/,
    );
    assert.throws(() => replace(owner, a.id, null), /ticket_changed/);
    assert.throws(() => replace(owner, a.id, randomUUID()), /ticket_changed/);
    assert.throws(() => issue(secondDevice, a.id), /ticket_exists/);
    db.sql(`update rsvps set status='PENDING' where guest_id='${a.id}';`);
    const auditBeforeDenied = db.sql("select count(*) from audit_logs;");
    assert.throws(() => replace(owner, a.id), /not confirmed/);
    assert.equal(current(a.id), expected);
    assert.equal(db.sql("select count(*) from audit_logs;"), auditBeforeDenied);
    db.sql(`update rsvps set status='CONFIRMED' where guest_id='${a.id}';`);
    // Inject failure after revocation to prove the original hash and audit roll back.
    db.sql(`create function public.reject_replacement_fixture() returns trigger language plpgsql as $$begin raise exception 'controlled insert failure';end$$;
    create trigger reject_replacement_fixture before insert on qr_credentials for each row execute function public.reject_replacement_fixture();`);
    const auditBeforeFailure = db.sql("select count(*) from audit_logs;");
    assert.throws(() => replace(owner, a.id), /controlled insert failure/);
    assert.equal(current(a.id), expected);
    assert.equal(
      db.sql("select count(*) from audit_logs;"),
      auditBeforeFailure,
    );
    db.sql(
      "drop trigger reject_replacement_fixture on qr_credentials;drop function public.reject_replacement_fixture();",
    );
    const concurrent = (uid: string) =>
      new Promise<{
        ok: boolean;
        ticket?: { token: string; guest_id: string };
      }>((resolve, reject) => {
        const sql = `begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';select replace_ticket('${event}','${a.id}','${expected}');select pg_sleep(0.1);commit;`;
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
        let out = "",
          err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("error", reject);
        child.on("exit", (code) => {
          if (!code) resolve({ ok: true, ticket: JSON.parse(out.trim()) });
          else if (err.includes("ticket_changed")) resolve({ ok: false });
          else reject(Error("Unexpected disposable concurrency failure"));
        });
        child.stdin.end(sql);
      });
    const race = await Promise.all([
      concurrent(owner),
      concurrent(secondDevice),
    ]);
    assert.equal(race.filter((r) => r.ok).length, 1);
    const next = race.find((r) => r.ok)!.ticket!;
    assert.notEqual(next.token, original.token);
    assert.equal(next.guest_id, a.id);
    assert.throws(() => replace(owner, a.id), /ticket_changed/);
    const hash = (token: string) =>
      createHash("sha256").update(token).digest("hex");
    assert.equal(
      db
        .sql(
          `select count(*) from qr_credentials where guest_id='${a.id}' and revoked_at is null;`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db
        .sql(`select token_hash from qr_credentials where id='${expected}';`)
        .trim(),
      hash(original.token),
    );
    assert.equal(
      db
        .sql(
          `select revoked_at is not null from qr_credentials where id='${expected}';`,
        )
        .trim(),
      "t",
    );
    const register = (token: string) =>
      db.rpc(staff, "app_mutate", {
        p_event: event,
        p_mutation: randomUUID(),
        p_type: "CHECKIN_CREATE",
        p_payload: { method: "QR", token_hash: hash(token) },
      });
    assert.throws(() => register(original.token), /invalid QR/);
    const checkin = register(next.token);
    assert.equal(register(next.token).id, checkin.id);
    assert.equal(
      db.sql(`select count(*) from checkins where guest_id='${a.id}';`).trim(),
      "1",
    );
    assert.equal(
      db.sql(`select status from rsvps where guest_id='${a.id}';`).trim(),
      "CONFIRMED",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from qr_credentials where guest_id='${b.id}' and token_hash='${hash(otherMember.token)}' and revoked_at is null;`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from qr_credentials where guest_id='${individual.id}' and token_hash='${hash(individualToken.token)}' and revoked_at is null;`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='qr_credentials' and entity_id='${expected}' and action='UPDATE';`,
        )
        .trim(),
      "1",
    );
    assert.ok(
      !db
        .sql(
          "select coalesce(jsonb_agg(to_jsonb(q)),'[]') from qr_credentials q;",
        )
        .includes(next.token),
    );
    assert.ok(
      !JSON.stringify(
        db.rpc(owner, "app_snapshot", { p_event: event }),
      ).includes(next.token),
    );
    assert.ok(
      !db
        .sql("select coalesce(jsonb_agg(to_jsonb(a)),'[]') from audit_logs a;")
        .includes(next.token),
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','public.replace_ticket(uuid,uuid,uuid)','EXECUTE');",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select has_function_privilege('authenticated','public.replace_ticket(uuid,uuid,uuid)','EXECUTE');",
        )
        .trim(),
      "t",
    );
    console.log(
      "Ticket replacement: unchanged upgrade data/RLS/legacy issuer; family isolation, denied roles, rollback, concurrent CAS, revoked QR rejection, valid QR admission, idempotent check-in and audit passed.",
    );
  } finally {
    db.stop();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
