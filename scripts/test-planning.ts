import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { TestPostgres } from "../tests/support/postgres";
import { ticketFixture } from "../tests/support/ticket-fixture";
const db = new TestPostgres();
async function main() {
  try {
    await db.start("pre-planning");
    db.sql(readFileSync("tests/storage-bootstrap.sql", "utf8"));
    const f = ticketFixture(db),
      migration = readFileSync(
        "supabase/migrations/20261028192221_wedding_planning.sql",
        "utf8",
      );
    const integrity = () =>
      db
        .sql(
          "select md5(string_agg(t::text,',' order by t::text)) from (select to_jsonb(g)::text t from guests g union all select to_jsonb(r)::text from rsvps r union all select to_jsonb(c)::text from checkins c union all select to_jsonb(q)::text from qr_credentials q) x",
        )
        .trim();
    const before = integrity();
    db.sql(
      "begin;" +
        migration.replace(/^begin;$/m, "").replace(/^commit;$/m, "") +
        "rollback;",
    );
    assert.equal(
      db.sql("select to_regclass('public.planning_entries') is null").trim(),
      "t",
    );
    db.sql(migration);
    assert.equal(integrity(), before);
    const snap = (user = f.admin) =>
      db.rpc(user, "planning_snapshot", { p_event: f.event });
    const action = (
      kind: string,
      id: string,
      values: object,
      version: number | null = null,
      request = randomUUID(),
      user = f.admin,
      event = f.event,
    ) =>
      db.rpc(user, "planning_action", {
        p_event: event,
        p_kind: kind,
        p_id: id,
        p_version: version,
        p_values: values,
        p_request: request,
      });
    assert.equal(snap().entries.length, 0);
    for (const user of [f.owner, f.staff, f.stranger]) {
      assert.throws(() => snap(user));
      assert.throws(() =>
        action(
          "BUDGET_SAVE",
          f.event,
          { amount_cents: 100 },
          null,
          randomUUID(),
          user,
        ),
      );
    }
    const supplier = randomUUID(),
      entry = randomUUID(),
      parcel = randomUUID();
    action("SUPPLIER_SAVE", supplier, {
      name: "Fornecedor teste",
      tax_id: "52998224725",
      pix_type: "CPF",
      pix_key: "52998224725",
    });
    action("ENTRY_SAVE", entry, {
      kind: "SERVICE",
      title: "Contrato",
      supplier_id: supplier,
      status: "CONTRACTED",
      agreed_cents: 200000,
      estimated_cents: 220000,
    });
    action("INSTALLMENT_SAVE", parcel, {
      entry_id: entry,
      description: "Entrada",
      amount_cents: 200000,
      due_on: "2026-10-01",
    });
    for (const amount of [50000, 70000, 80000])
      action("PAYMENT_SAVE", randomUUID(), {
        entry_id: entry,
        installment_id: parcel,
        amount_cents: amount,
        paid_on: "2026-10-20",
        method: "PIX",
      });
    assert.equal(snap().payments.length, 3);
    assert.equal(
      snap().payments.reduce(
        (n: number, p: { amount_cents: number }) => n + p.amount_cents,
        0,
      ),
      200000,
    );
    assert.throws(() =>
      action("PAYMENT_SAVE", randomUUID(), {
        entry_id: entry,
        installment_id: parcel,
        amount_cents: 1,
        paid_on: "2026-10-20",
        method: "PIX",
      }),
    );
    // Reusable suppliers, edits, optimistic versions, exact budget, cancellation and preserved bank history.
    assert.throws(() =>
      action("SUPPLIER_SAVE", randomUUID(), {
        name: "CPF inválido",
        tax_id: "11111111111",
      }),
    );
    assert.throws(() =>
      action("SUPPLIER_SAVE", randomUUID(), {
        name: "PIX inválido",
        pix_type: "PHONE",
        pix_key: "62999999999",
      }),
    );
    assert.throws(() =>
      action("SUPPLIER_SAVE", randomUUID(), { name: "Fornecedor teste" }),
    );
    action("BUDGET_SAVE", f.event, { amount_cents: 400000 });
    action("BUDGET_SAVE", f.event, { amount_cents: 450000 }, 1);
    assert.equal(snap().budget.amount_cents, 450000);
    action(
      "SUPPLIER_SAVE",
      supplier,
      { pix_type: "EMAIL", pix_key: "pay@example.test" },
      1,
    );
    assert.throws(() =>
      action("SUPPLIER_SAVE", supplier, { name: "Stale" }, 1),
    );
    const avulsa = randomUUID(),
      schedule = randomUUID();
    action("ENTRY_SAVE", avulsa, {
      kind: "EXPENSE",
      title: "Sem fornecedor",
      status: "PLANNED",
      estimated_cents: 10001,
      agreed_cents: 10001,
    });
    action(
      "SCHEDULE_GENERATE",
      avulsa,
      { quantity: 3, first_due_on: "2026-01-31" },
      1,
    );
    const scheduled = snap().installments.filter(
      (i: { entry_id: string }) => i.entry_id === avulsa,
    );
    assert.equal(
      scheduled.reduce(
        (n: number, i: { amount_cents: number }) => n + i.amount_cents,
        0,
      ),
      10001,
    );
    assert.deepEqual(
      scheduled.map((i: { due_on: string }) => i.due_on),
      ["2026-01-31", "2026-02-28", "2026-03-31"],
    );
    assert.throws(() =>
      action(
        "SCHEDULE_GENERATE",
        avulsa,
        { quantity: 3, first_due_on: "2026-01-31" },
        2,
      ),
    );
    assert.throws(() =>
      action("PAYMENT_SAVE", randomUUID(), {
        entry_id: avulsa,
        installment_id: scheduled[0].id,
        amount_cents: 100,
        paid_on: "2026-10-20",
        method: "PIX",
      }),
    );
    assert.throws(() => action("ENTRY_SAVE", entry, { status: "PLANNED" }, 1));
    action(
      "ENTRY_SAVE",
      entry,
      { status: "CANCELLED", settlement_cents: 200000 },
      1,
    );
    assert.equal(snap().payments.length, 3);
    action("ENTRY_ARCHIVE", entry, {}, 2);
    action(
      "ENTRY_SAVE",
      entry,
      { financial_notes: "Conciliação histórica preservada" },
      3,
    );
    assert.ok(
      snap().entries.find((e: { id: string }) => e.id === entry).deleted_at,
    );
    action("SUPPLIER_ARCHIVE", supplier, {}, 2);
    assert.equal(
      snap().entries.find((e: { id: string }) => e.id === entry).supplier_id,
      supplier,
    );
    const firstPay = snap().payments[0];
    action(
      "PAYMENT_SAVE",
      firstPay.id,
      { notes: "Histórico do pagamento corrigido" },
      firstPay.version,
    );
    assert.equal(
      snap().payments.find((p: { id: string }) => p.id === firstPay.id)
        .amount_cents,
      firstPay.amount_cents,
    );
    action("PAYMENT_ARCHIVE", firstPay.id, {}, firstPay.version + 1);
    assert.ok(
      snap().payments.find((p: { id: string }) => p.id === firstPay.id)
        .deleted_at,
    );
    assert.equal(snap().suppliers[0].pix_key, "pay@example.test");
    const historicalPayment = snap().payments[0];
    assert.equal(historicalPayment.supplier_id, supplier);
    assert.equal(historicalPayment.supplier_name, "Fornecedor teste");
    action("SUPPLIER_SAVE", supplier, { name: "Fornecedor renomeado" }, 3);
    assert.equal(snap().payments[0].supplier_name, "Fornecedor teste");

    assert.equal(
      db
        .sql(
          "select count(*) from audit_logs where entity like 'planning_%' and metadata::text like '%pay@example.test%'",
        )
        .trim(),
      "0",
    );
    // Archive does not trap an outstanding obligation: preserve previous payments and settle explicitly.
    const archivedEntry = randomUUID(),
      archivedParcel = randomUUID();
    action("ENTRY_SAVE", archivedEntry, {
      kind: "EXPENSE",
      title: "Quitação após arquivamento",
      status: "CONTRACTED",
      agreed_cents: 10000,
    });
    action("INSTALLMENT_SAVE", archivedParcel, {
      entry_id: archivedEntry,
      description: "Entrada",
      amount_cents: 10000,
      due_on: "2099-11-30",
    });
    action("PAYMENT_SAVE", randomUUID(), {
      entry_id: archivedEntry,
      installment_id: archivedParcel,
      amount_cents: 3000,
      paid_on: "2026-10-20",
      method: "PIX",
    });
    action("ENTRY_ARCHIVE", archivedEntry, {}, 1);
    action("INSTALLMENT_ARCHIVE", archivedParcel, {}, 1);
    action(
      "SCHEDULE_GENERATE",
      archivedEntry,
      { quantity: 2, first_due_on: "2099-12-01" },
      2,
    );
    const remainingParcels = snap().installments.filter(
      (i: { entry_id: string; deleted_at: string | null }) =>
        i.entry_id === archivedEntry && !i.deleted_at,
    );
    assert.equal(
      remainingParcels.reduce(
        (n: number, i: { amount_cents: number }) => n + i.amount_cents,
        0,
      ),
      7000,
    );
    for (const i of remainingParcels)
      action("PAYMENT_SAVE", randomUUID(), {
        entry_id: archivedEntry,
        installment_id: i.id,
        amount_cents: i.amount_cents,
        paid_on: "2026-10-20",
        method: "PIX",
      });
    assert.equal(
      snap()
        .payments.filter(
          (p: { entry_id: string }) => p.entry_id === archivedEntry,
        )
        .reduce(
          (n: number, p: { amount_cents: number }) => n + p.amount_cents,
          0,
        ),
      10000,
    );
    assert.ok(
      snap().entries.find((e: { id: string }) => e.id === archivedEntry)
        .deleted_at,
    );

    // RLS, direct mutation denial, cross-event composite FKs and SECURITY DEFINER ACLs.
    for (const user of [f.owner, f.staff]) {
      assert.equal(
        db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub='${user}';select count(*) from planning_entries;commit;`,
          )
          .trim(),
        "0",
      );
      assert.throws(() =>
        db.sql(
          `begin;set local role authenticated;set local request.jwt.claim.sub='${user}';update planning_entries set agreed_cents=0;commit;`,
        ),
      );
    }
    assert.throws(() =>
      db.sql(
        `begin;set local role anon;select planning_snapshot('${f.event}');commit;`,
      ),
    );
    assert.throws(() =>
      db.sql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${f.admin}';select planning_document_finish('${f.event}','${schedule}','${"a".repeat(64)}');commit;`,
      ),
    );
    const other = randomUUID(),
      otherSupplier = randomUUID();
    db.sql(
      `insert into events(id,title,starts_at) values('${other}','Outro evento','2026-12-15T19:00:00Z');insert into user_roles(event_id,user_id,role) values('${other}','${f.staff}','ADMIN');`,
    );
    action(
      "SUPPLIER_SAVE",
      otherSupplier,
      { name: "Outro fornecedor" },
      null,
      randomUUID(),
      f.staff,
      other,
    );
    assert.throws(() =>
      action("ENTRY_SAVE", randomUUID(), {
        kind: "SERVICE",
        title: "Isolamento",
        supplier_id: otherSupplier,
      }),
    );
    assert.throws(() =>
      db.rpc(f.admin, "planning_snapshot", { p_event: other }),
    );
    // Private document lifecycle: pending objects cannot be read, and ready objects disappear on logical deletion.
    const doc = randomUUID(),
      hash = "a".repeat(64),
      docRequest = randomUUID();
    const docPayload = {
      entry_id: entry,
      name: "Contrato.pdf",
      mime: "application/pdf",
      size_bytes: 100,
      sha256: hash,
    };
    const prepared = action(
      "DOCUMENT_PREPARE",
      doc,
      docPayload,
      null,
      docRequest,
    );
    assert.equal(
      action("DOCUMENT_PREPARE", doc, docPayload, null, docRequest).path,
      prepared.path,
    );
    assert.throws(() =>
      action(
        "DOCUMENT_PREPARE",
        doc,
        { ...docPayload, sha256: "b".repeat(64) },
        null,
        docRequest,
      ),
    );
    db.sql(
      `insert into storage.objects(bucket_id,name) values('wedding-planning','${f.event}/${doc}');`,
    );
    const readStorage = (user: string) =>
      db
        .sql(
          `begin;set local role authenticated;set local request.jwt.claim.sub='${user}';select count(*) from storage.objects where name='${f.event}/${doc}';commit;`,
        )
        .trim();
    assert.equal(readStorage(f.admin), "0");
    db.sql(
      `begin;set local role service_role;select planning_document_finish('${f.event}','${doc}','${hash}');commit;`,
    );
    assert.equal(readStorage(f.admin), "1");
    assert.equal(readStorage(f.staff), "0");
    assert.equal(readStorage(f.owner), "0");
    assert.throws(() =>
      db.sql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${f.admin}';insert into storage.objects(bucket_id,name) values('wedding-planning','forged');commit;`,
      ),
    );
    action("DOCUMENT_SAVE", doc, { name: "Contrato assinado.pdf" }, 2);
    action("DOCUMENT_ARCHIVE", doc, {}, 3);
    assert.equal(readStorage(f.admin), "0");
    assert.equal(
      db
        .sql("select public from storage.buckets where id='wedding-planning'")
        .trim(),
      "f",
    );
    const history = (
      entity: string | null = null,
      before: string | null = null,
      cursor: string | null = null,
      user = f.admin,
    ) =>
      db.rpc(user, "planning_history", {
        p_event: f.event,
        p_entity: entity,
        p_before: before,
        p_cursor: cursor,
      });
    assert.ok(
      history().some((h: { action: string }) => h.action === "DOCUMENT_UPLOAD"),
    );
    assert.ok(
      history(entry).some(
        (h: { action: string }) => h.action === "PAYMENT_SAVE",
      ),
    );
    assert.throws(() => history(null, null, null, f.staff));
    db.sql(
      `insert into audit_logs(event_id,actor,action,entity,entity_id,created_at) select '${f.event}','${f.admin}','ENTRY_SAVE','planning_entries','${entry}',now()-interval '1 day' from generate_series(1,101);`,
    );
    const page1 = history(),
      last = page1.at(-1),
      page2 = history(null, last.created_at, last.id);
    assert.equal(page1.length, 100);
    assert.ok(page2.length > 0);
    assert.equal(
      new Set([...page1, ...page2].map((h: { id: string }) => h.id)).size,
      page1.length + page2.length,
    );
    assert.equal(
      page1.length + page2.length,
      Number(
        db
          .sql(
            `select count(*) from audit_logs where event_id='${f.event}' and left(entity,9)='planning_'`,
          )
          .trim(),
      ),
    );
    // Independent connections: event-scoped lock serializes overpayment and duplicate request races.
    const concurrent = (sql: string) =>
      new Promise<{ code: number | null; error: string }>((resolve) => {
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
        let error = "";
        child.stdout.resume();
        child.stderr.on("data", (b) => (error += b.toString()));
        child.on("close", (code) => resolve({ code, error }));
        child.stdin.end(sql);
      });
    const ce = randomUUID(),
      ci = randomUUID();
    action("ENTRY_SAVE", ce, {
      kind: "EXPENSE",
      title: "Concorrência",
      status: "CONTRACTED",
      agreed_cents: 10000,
    });
    action("INSTALLMENT_SAVE", ci, {
      entry_id: ce,
      description: "Parcela",
      amount_cents: 10000,
      due_on: "2026-10-20",
    });
    const command = (pid: string, req: string, amount: number) =>
      `begin;set local role authenticated;set local request.jwt.claim.sub='${f.admin}';select planning_action('${f.event}','PAYMENT_SAVE','${pid}',null,'${JSON.stringify({ entry_id: ce, installment_id: ci, amount_cents: amount, paid_on: "2026-10-20", method: "PIX" })}'::jsonb,'${req}');commit;`;
    const races = await Promise.all([
      concurrent(command(randomUUID(), randomUUID(), 6000)),
      concurrent(command(randomUUID(), randomUUID(), 6000)),
    ]);
    assert.equal(races.filter((r) => r.code === 0).length, 1);
    assert.ok(
      races.find((r) => r.code !== 0)?.error.includes("planning_overpay"),
    );
    const once = randomUUID(),
      req = randomUUID();
    const duplicates = await Promise.all([
      concurrent(command(once, req, 4000)),
      concurrent(command(once, req, 4000)),
    ]);
    assert.ok(duplicates.every((r) => r.code === 0));
    assert.equal(
      snap().payments.filter((p: { id: string }) => p.id === once).length,
      1,
    );
    assert.equal(
      db
        .sql(
          `select count(*) from audit_logs where entity='planning_payments' and entity_id='${once}'`,
        )
        .trim(),
      "1",
    );
    assert.equal(integrity(), before);
    console.log(
      "Validated migration SHA-256:",
      createHash("sha256").update(migration).digest("hex"),
    );
    console.log(
      "Planning upgrade/rollback, suppliers, budget, exact partial payments, schedules, cancellation/archive, authorization/RLS, private documents, audit, concurrent/idempotent payments and guest integrity PASS",
    );
  } finally {
    db.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
