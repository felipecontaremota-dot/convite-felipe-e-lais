// All assertions run in a disposable database, never in Supabase PROD.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
import { verifyCheckinUpgrade } from "../tests/support/checkin-upgrade";
async function main() {
  await verifyCheckinUpgrade();
  const db = new TestPostgres();
  try {
    await db.start();
    console.log(db.sql(readFileSync("tests/ceremonial.sql", "utf8")));
    console.log(db.sql(readFileSync("tests/checkin-reversal.sql", "utf8")));
    const event = "00000000-0000-4000-8000-000000000001",
      admin = "cd000000-0000-4000-8000-000000000001",
      staff = "cd000000-0000-4000-8000-000000000002",
      second = "cd000000-0000-4000-8000-000000000003";
    db.sql(
      `insert into auth.users(id) values('${admin}'),('${staff}'),('${second}'); insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST'),('${event}','${second}','CEREMONIALIST');`,
    );
    const g = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Concurrent QR fixture" },
    });
    const register = (
      user: string,
      payload: object,
      mutation = randomUUID(),
      eventId = event,
    ) =>
      db.rpc(user, "app_mutate", {
        p_event: eventId,
        p_mutation: mutation,
        p_type: "CHECKIN_CREATE",
        p_payload: payload,
      });
    const denied = (fn: () => unknown) => assert.throws(fn);
    const manual = { guest_id: g.id, method: "MANUAL" };
    for (const status of ["PENDING", "DECLINED"]) {
      db.sql(`update rsvps set status='${status}' where guest_id='${g.id}';`);
      denied(() => register(staff, manual));
    }
    db.sql(`update rsvps set status='CONFIRMED' where guest_id='${g.id}';`);
    for (const state of ["active=false", "archived_at=now()"]) {
      db.sql(`update invitations set ${state} where id='${g.invitation_id}';`);
      denied(() => register(staff, manual));
      db.sql(
        `update invitations set active=true,archived_at=null where id='${g.invitation_id}';`,
      );
    }
    denied(() => register(staff, { guest_id: g.id, method: null }));
    denied(() => register(staff, manual, randomUUID(), randomUUID()));
    const ticket = db.rpc(admin, "issue_ticket", {
      p_event: event,
      p_guest: g.id,
      p_regenerate: false,
    });
    const hash = db
      .sql(
        `select token_hash from qr_credentials where guest_id='${g.id}' and revoked_at is null;`,
      )
      .trim();
    assert.equal(ticket.guest_id, g.id);
    const other = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Other QR owner" },
    });
    denied(() =>
      register(staff, { guest_id: other.id, method: "QR", token_hash: hash }),
    );
    db.sql(
      `update qr_credentials set revoked_at=now() where guest_id='${g.id}';`,
    );
    denied(() => register(staff, { method: "QR", token_hash: hash }));
    db.sql(
      `update qr_credentials set revoked_at=null where guest_id='${g.id}';`,
    );
    const concurrent = (
      user: string,
      method: "QR" | "MANUAL" | "REVERT",
      id?: string,
      mutation = randomUUID(),
    ) =>
      new Promise<any>((resolve, reject) => {
        const sql = `begin;set local role authenticated;set local request.jwt.claim.sub='${user}';select app_mutate('${event}','${mutation}','${method === "REVERT" ? "CHECKIN_REVERT" : "CHECKIN_CREATE"}','${JSON.stringify(method === "REVERT" ? { id } : method === "QR" ? { method, token_hash: hash } : manual)}'::jsonb);select pg_sleep(0.2);commit;`;
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
        child.stdout.on("data", (b) => (out += b));
        child.stderr.on("data", (b) => (err += b));
        child.on("error", reject);
        child.on("exit", (code) =>
          code ? reject(Error(err)) : resolve(JSON.parse(out.trim())),
        );
        child.stdin.end(sql);
      });
    const results = await Promise.all([
      concurrent(staff, "QR"),
      concurrent(second, "MANUAL"),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(results.filter((r) => !r.duplicate).length, 1);
    assert.equal(
      db.sql(`select count(*) from checkins where guest_id='${g.id}';`).trim(),
      "1",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='checkins' and entity_id='${results[0].id}';`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db.sql(`select status from rsvps where guest_id='${g.id}';`).trim(),
      "CONFIRMED",
    );
    const removalId = randomUUID();
    const removed = await Promise.all([
      concurrent(staff, "REVERT", results[0].id, removalId),
      concurrent(second, "REVERT", results[0].id),
    ]);
    assert.equal(removed.filter((r) => !r.duplicate).length, 1);
    assert.equal(
      db.sql(`select count(*) from checkins where guest_id='${g.id}';`).trim(),
      "0",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='checkins' and entity_id='${results[0].id}' and action='DELETE';`,
        )
        .trim(),
      "1",
    );
    const fresh = register(staff, { method: "QR", token_hash: hash });
    await concurrent(staff, "REVERT", results[0].id, removalId);
    assert.equal(
      db.sql(`select id from checkins where guest_id='${g.id}';`).trim(),
      fresh.id,
    );
    await Promise.all([
      concurrent(staff, "REVERT", fresh.id),
      concurrent(second, "QR"),
    ]);
    const active = Number(
      db.sql(`select count(*) from checkins where guest_id='${g.id}';`).trim(),
    );
    assert.ok(active === 0 || active === 1);
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='checkins' and entity_id='${fresh.id}' and action='DELETE';`,
        )
        .trim(),
      "1",
    );
    assert.equal(
      db.sql(`select status from rsvps where guest_id='${g.id}';`).trim(),
      "CONFIRMED",
    );
    assert.equal(
      db
        .sql(
          `select count(*) from qr_credentials where guest_id='${g.id}' and token_hash='${hash}' and revoked_at is null;`,
        )
        .trim(),
      "1",
    );
    console.log(
      "Independent connections: remove/remove, stale retry after reentry, remove/register races passed; original QR and RSVP preserved.",
    );
    console.log(
      "Inactive/archived/negative/pending/cross-event/revoked/mismatched QR denied; concurrent QR+manual inserts exactly one audited check-in.",
    );
  } finally {
    db.stop();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
