import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
const db = new TestPostgres();
async function main() {
  try {
    await db.start("pre-planning");
    db.sql(readFileSync("tests/storage-bootstrap.sql", "utf8"));
    db.sql(
      readFileSync(
        "supabase/migrations/20261028192221_wedding_planning.sql",
        "utf8",
      ),
    );
    const f = ticketFixture(db),
      oldVendor = randomUUID(),
      oldEntry = randomUUID(),
      oldDue = randomUUID();
    const legacy = (kind: string, id: string, values: object) =>
      db.rpc(f.admin, "planning_action", {
        p_event: f.event,
        p_kind: kind,
        p_id: id,
        p_version: null,
        p_values: values,
        p_request: randomUUID(),
      });
    legacy("SUPPLIER_SAVE", oldVendor, {
      name: "Cadastro anterior",
      pix_type: "EMAIL",
      pix_key: "archive@example.test",
    });
    legacy("ENTRY_SAVE", oldEntry, {
      title: "Contrato inconsistente",
      kind: "SERVICE",
      status: "COMPLETED",
      agreed_cents: 0,
      supplier_id: oldVendor,
    });
    legacy("INSTALLMENT_SAVE", oldDue, {
      entry_id: oldEntry,
      description: "Entrada",
      amount_cents: 182000,
      due_on: "2026-10-08",
      position: 1,
    });
    assert.throws(() =>
      legacy("PAYMENT_SAVE", randomUUID(), {
        entry_id: oldEntry,
        installment_id: oldDue,
        amount_cents: 182000,
        paid_on: "2026-10-08",
        method: "PIX",
      }),
    );
    const integrity = () =>
      db.sql(
        "select md5(string_agg(t,',' order by t)) from (select to_jsonb(t)::text t from guests t union all select to_jsonb(t)::text from invitations t union all select to_jsonb(t)::text from rsvps t union all select to_jsonb(t)::text from qr_credentials t union all select to_jsonb(t)::text from checkins t union all select to_jsonb(t)::text from wedding_party_private.promotions t union all select to_jsonb(t)::text from planning_suppliers t union all select to_jsonb(t)::text from planning_entries t union all select to_jsonb(t)::text from planning_installments t union all select to_jsonb(t)::text from planning_payments t) x",
      );
    const before = integrity();
    const filename = readdirSync("supabase/migrations").find((n) =>
      n.endsWith("_simple_supplier_planning.sql"),
    )!;
    const migration = readFileSync(`supabase/migrations/${filename}`, "utf8");
    db.sql(migration.replace(/^commit;$/m, "rollback;"));
    assert.equal(
      db.sql("select to_regclass('public.planning_vendors') is null").trim(),
      "t",
    );
    db.sql(migration);
    const catalog = () =>
      db.sql(
        "select jsonb_build_object('oid',oid,'acl',proacl,'config',proconfig,'owner',proowner)::text from pg_proc where oid='planning_simple_action(uuid,text,uuid,integer,jsonb,uuid)'::regprocedure",
      );
    const originalCatalog = catalog();
    const scopedFile = readdirSync("supabase/migrations").find((n) =>
      n.endsWith("_scoped_due_updates.sql"),
    )!;
    db.sql(readFileSync(`supabase/migrations/${scopedFile}`, "utf8"));
    assert.equal(catalog(), originalCatalog);
    assert.equal(integrity(), before);
    const snap = (uid = f.admin) =>
      db.rpc(uid, "planning_simple_snapshot", { p_event: f.event });
    assert.equal(snap().vendors[0].details.pix_key, "archive@example.test");
    assert.equal(snap().vendors[0].total_cents, 0);
    assert.equal(snap().payments.length, 0);
    const action = (
      kind: string,
      id: string,
      values: object,
      version: number | null = null,
      request = randomUUID(),
      user = f.admin,
      event = f.event,
    ) =>
      db.rpc(user, "planning_simple_action", {
        p_event: event,
        p_kind: kind,
        p_id: id,
        p_version: version,
        p_values: values,
        p_request: request,
      });
    for (const uid of [f.owner, f.staff, f.stranger]) {
      assert.throws(() => snap(uid));
      assert.throws(() =>
        action("VENDOR_SAVE", randomUUID(), {}, null, randomUUID(), uid),
      );
    }
    const vendor = randomUUID(),
      dues = [182000, 819000, 819000].map((n, i) => ({
        id: randomUUID(),
        label: i === 0 ? "Entrada" : `Parcela ${i}`,
        amount_cents: n,
        due_on: `2026-${10 + i}-08`,
        position: i,
      }));
    const values = {
      name: "Villarejo fixture",
      details: {},
      total_cents: 1820000,
      plan_type: "DOWN",
      dues,
    };
    action("VENDOR_SAVE", vendor, values);
    const payment = randomUUID(),
      request = randomUUID(),
      pay = {
        due_id: dues[0]!.id,
        amount_cents: 182000,
        paid_on: "2026-10-08",
        method: "PIX",
      };
    action("PAYMENT_SAVE", payment, pay, null, request);
    action("PAYMENT_SAVE", payment, pay, null, request);
    assert.equal(snap().payments.length, 1);
    assert.equal(snap().payments[0].amount_cents, 182000);
    assert.throws(() =>
      action("PAYMENT_SAVE", randomUUID(), { ...pay, amount_cents: 1 }),
    );
    action("PAYMENT_SAVE", randomUUID(), {
      ...pay,
      due_id: dues[1]!.id,
      amount_cents: 50000,
    });
    action("PAYMENT_SAVE", randomUUID(), {
      ...pay,
      due_id: dues[1]!.id,
      amount_cents: 769000,
    });
    assert.throws(() =>
      action(
        "VENDOR_SAVE",
        vendor,
        { ...values, dues: dues.slice(1), total_cents: 1638000 },
        1,
      ),
    );
    const edited = {
      ...values,
      dues: dues.map((d, i) => (i === 0 ? { ...d, due_on: "2026-10-09" } : d)),
    };
    assert.throws(() => action("VENDOR_SAVE", vendor, edited, 1));
    action("VENDOR_SAVE", vendor, { ...edited, confirm_paid: true }, 1);
    assert.throws(() => action("VENDOR_SAVE", vendor, values, 1));
    assert.throws(() =>
      action("VENDOR_DELETE", vendor, { expected_paid_cents: 0 }, 2),
    );
    // Independent transactions compete for the same outstanding due. Exactly one wins.
    const call = (amount: number) =>
      new Promise<number>((resolve) => {
        const id = randomUUID(),
          q = `begin;set local role authenticated;set local request.jwt.claim.sub='${f.admin}';select planning_simple_action('${f.event}','PAYMENT_SAVE','${id}',null,'${JSON.stringify({ ...pay, due_id: dues[2]!.id, amount_cents: amount })}'::jsonb,'${randomUUID()}');commit;`;
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
        const child = spawn(db.ci ? "sudo" : "docker", args, {
          stdio: ["pipe", "ignore", "ignore"],
        });
        child.on("close", (c) => resolve(c ?? 1));
        child.stdin.end(q);
      });
    const outcomes = await Promise.all([call(819000), call(819000)]);
    assert.equal(outcomes.filter((c) => c === 0).length, 1);
    assert.equal(
      snap().payments.reduce(
        (n: number, p: { amount_cents: number }) => n + p.amount_cents,
        0,
      ),
      1820000,
    );
    const count = snap().payments.length;
    action("VENDOR_DELETE", vendor, { expected_paid_cents: 1820000 }, 2);
    assert.equal(snap().payments.length, 0);
    assert.equal(
      Number(
        db
          .sql(
            `select count(*) from planning_settlements where vendor_id='${vendor}'`,
          )
          .trim(),
      ),
      count,
    );
    assert.equal(integrity(), before);
    assert.equal(
      db
        .sql(
          "select has_function_privilege('anon','planning_simple_snapshot(uuid)','EXECUTE')",
        )
        .trim(),
      "f",
    );
    assert.equal(
      db
        .sql(
          "select has_table_privilege('authenticated','planning_vendors','INSERT')",
        )
        .trim(),
      "f",
    );
    const strangerCount = db
      .sql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${f.owner}';select count(*) from planning_vendors;commit;`,
      )
      .trim();
    assert.equal(strangerCount, "0");
    assert.throws(() =>
      action(
        "VENDOR_SAVE",
        randomUUID(),
        values,
        null,
        randomUUID(),
        f.admin,
        randomUUID(),
      ),
    );
    // Deterministic cross-event race: B passes its existence check, pauses
    // before INSERT, then A inserts the same UUID. B must not update A's row.
    const eventB = randomUUID(),
      vendorA = randomUUID(),
      vendorB = randomUUID(),
      sharedDue = randomUUID();
    const gateKey = BigInt(
      "0x" + randomUUID().replaceAll("-", "").slice(0, 15),
    ).toString();
    db.sql(`insert into events(id,title,starts_at) values('${eventB}','Other financial fixture','2026-12-15');insert into user_roles(event_id,user_id,role) values('${eventB}','${f.staff}','ADMIN');
      create function public.simple_test_gate() returns trigger language plpgsql as $gate$ begin if new.vendor_id='${vendorB}'::uuid then perform pg_advisory_xact_lock(${gateKey}::bigint);end if;return new;end $gate$;
      create trigger simple_test_gate before insert on planning_dues for each row execute function public.simple_test_gate();`);
    const psqlArgs = db.ci
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
    const gate = spawn(db.ci ? "sudo" : "docker", psqlArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    gate.stderr.resume();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("gate startup timeout")),
          5000,
        );
        gate.on("error", reject);
        let gateOutput = "";
        gate.stdout.on("data", (chunk) => {
          gateOutput += String(chunk);
          if (gateOutput.includes("gate-ready")) {
            clearTimeout(timeout);
            resolve();
          }
        });
        gate.stdin.write(
          `select pg_advisory_lock(${gateKey}::bigint);select 'gate-ready';\n`,
        );
      });
      const racingValues = {
        name: "Event B race",
        details: {},
        total_cents: 200,
        plan_type: "CASH",
        dues: [
          {
            id: sharedDue,
            label: "B",
            amount_cents: 200,
            due_on: "2026-12-01",
            position: 0,
          },
        ],
      };
      const blocked = spawn(db.ci ? "sudo" : "docker", psqlArgs, {
        stdio: ["pipe", "ignore", "pipe"],
      });
      let blockedError = "";
      blocked.stderr.on("data", (chunk) => (blockedError += String(chunk)));
      const blockedDone = new Promise<number>((resolve) =>
        blocked.on("close", (code) => resolve(code ?? 1)),
      );
      blocked.stdin.end(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${f.staff}';select planning_simple_action('${eventB}','VENDOR_SAVE','${vendorB}',null,'${JSON.stringify(racingValues)}'::jsonb,'${randomUUID()}');commit;`,
      );
      let waiting = false;
      for (let n = 0; n < 100; n++) {
        waiting =
          db
            .sql(
              `select exists(select 1 from pg_stat_activity where datname='${db.ci ? db.name : "postgres"}' and wait_event='advisory' and query like '%${vendorB}%')`,
            )
            .trim() === "t";
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "B must pause after validation and before inserting");
      action("VENDOR_SAVE", vendorA, {
        name: "Event A race",
        details: {},
        total_cents: 100,
        plan_type: "CASH",
        dues: [
          {
            id: sharedDue,
            label: "A",
            amount_cents: 100,
            due_on: "2026-12-01",
            position: 0,
          },
        ],
      });
      gate.stdin.end(`select pg_advisory_unlock(${gateKey}::bigint);\n`);
      assert.notEqual(
        await blockedDone,
        0,
        "cross-event UUID conflict must abort",
      );
      assert.match(blockedError, /simple_invalid/);
      assert.equal(
        db
          .sql(
            `select amount_cents from planning_dues where id='${sharedDue}' and event_id='${f.event}' and vendor_id='${vendorA}'`,
          )
          .trim(),
        "100",
      );
      assert.equal(
        db
          .sql(`select count(*) from planning_vendors where id='${vendorB}'`)
          .trim(),
        "0",
        "failed request rolls back supplier too",
      );
    } finally {
      gate.kill();
    }
    assert.equal(integrity(), before);
    console.log(
      "Cross-event UUID race: foreign due unchanged, conflicting supplier transaction rolled back PASS",
    );
    console.log(
      "Simple supplier planning: old 1820/zero-contract bug reproduced; exact equality, partial payments, true overpay, plan validation, paid changes, archive reset, RLS/ACL, scope/rollback, stale writes, idempotence and concurrent payments PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
