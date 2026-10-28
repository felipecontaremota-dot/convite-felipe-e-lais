import { describe, it, expect } from "vitest";
import {
  addDays,
  cents,
  committed,
  emptyPlanning,
  ledger,
  maskTax,
  pixKey,
  todaySP,
  validTax,
  type Entry,
  type Installment,
  type Payment,
} from "../src/features/planning/domain";
const entry = (id = "e", extra: Partial<Entry> = {}) =>
  ({
    id,
    event_id: "event",
    title: id,
    status: "CONTRACTED",
    kind: "EXPENSE",
    estimated_cents: 220000,
    agreed_cents: 200000,
    discount_cents: 0,
    settlement_cents: 0,
    deleted_at: null,
    ...extra,
  }) as Entry;
const parcel = (id = "i", extra: Partial<Installment> = {}) =>
  ({
    id,
    entry_id: "e",
    amount_cents: 200000,
    due_on: "2026-10-28",
    position: 1,
    deleted_at: null,
    ...extra,
  }) as Installment;
const pay = (amount_cents: number, extra: Partial<Payment> = {}) =>
  ({
    id: Math.random().toString(),
    entry_id: "e",
    installment_id: "i",
    amount_cents,
    deleted_at: null,
    ...extra,
  }) as Payment;
const date = "2026-10-28";
describe("planning exact money and identity", () => {
  it.each([
    ["0", 0],
    ["1,01", 101],
    ["R$ 1.234,56", 123456],
    ["999.999,99", 99999999],
    ["0,1", 10],
  ])("parses %s", (value, amount) => expect(cents(String(value))).toBe(amount));
  it.each(["-1,00", "1.2", "1,234", "1e8", "Infinity", "1.000.000.000,00", ""])(
    "rejects ambiguous/out of range value %s",
    (value) => expect(() => cents(value)).toThrow(),
  );
  it("uses São Paulo calendar dates independently of UTC midnight", () => {
    expect(todaySP(new Date("2026-10-29T01:00:00Z"))).toBe(date);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it.each(["52998224725", "11222333000181"])("validates checksums %s", (v) =>
    expect(validTax(v)).toBe(true),
  );
  it.each(["11111111111", "12345678901", "11222333000182"])(
    "rejects invalid document %s",
    (v) => expect(validTax(v)).toBe(false),
  );
  it("masks without changing PIX identity and validates all supported types", () => {
    expect(maskTax("52998224725")).toBe("529.982.247-25");
    expect(pixKey("CPF", "529.982.247-25")).toBe("52998224725");
    expect(pixKey("CNPJ", "11.222.333/0001-81")).toBe("11222333000181");
    expect(pixKey("EMAIL", "Case@example.test")).toBe("Case@example.test");
    expect(pixKey("PHONE", "+5562999999999")).toBe("+5562999999999");
    expect(pixKey("PHONE", "+55 (62) 9 9999-9999")).toBe("+5562999999999");
    expect(pixKey("RANDOM", "a1234567-1234-1234-1234-123456789012")).toContain(
      "a123",
    );
    expect(() => pixKey("PHONE", "62999999999")).toThrow();
    expect(() => pixKey("CPF", "11111111111")).toThrow();
  });
});
describe("planning ledger", () => {
  it("starts empty without financial fixtures", () => {
    const l = ledger(emptyPlanning(), date);
    expect(l.committed).toBe(0);
    expect(l.paid).toBe(0);
    expect(l.budget).toBeNull();
  });
  it("does not treat proposals or estimated values as commitments", () => {
    for (const status of ["PLANNED", "QUOTED", "NEGOTIATING"] as const)
      expect(committed(entry("e", { status }))).toBe(0);
  });
  it("sums multiple partial payments exactly once and preserves contract state", () => {
    const d = {
      ...emptyPlanning(),
      entries: [entry()],
      installments: [parcel()],
      payments: [pay(50000), pay(70000), pay(80000)],
    };
    const l = ledger(d, date);
    expect(l.paid).toBe(200000);
    expect(l.balance).toBe(0);
    expect(l.percent).toBe(100);
    expect(l.items[0]!.status).toBe("Pago");
    expect(d.entries[0]!.status).toBe("CONTRACTED");
  });
  it("keeps completed unpaid obligations, cancellations and genuine paid history", () => {
    const d = {
      ...emptyPlanning(),
      entries: [
        entry("e", { status: "CANCELLED", settlement_cents: 50000 }),
        entry("other", { status: "COMPLETED" }),
      ],
      payments: [pay(50000)],
    };
    const l = ledger(d, date);
    expect(l.committed).toBe(250000);
    expect(l.paid).toBe(50000);
    expect(l.balance).toBe(200000);
  });
  it("isolates overpayment credit from other debts and never produces a negative balance", () => {
    const d = {
      ...emptyPlanning(),
      entries: [entry(), entry("other")],
      payments: [pay(250000)],
    };
    const l = ledger(d, date);
    expect(l.credit).toBe(50000);
    expect(l.percent).toBe(50);
    expect(l.balance).toBe(200000);
    expect(l.items[0]!.balance).toBe(0);
    const partial = ledger(
      {
        ...emptyPlanning(),
        entries: [entry()],
        installments: [
          parcel("a", { amount_cents: 100000 }),
          parcel("b", { amount_cents: 100000 }),
        ],
        payments: [pay(150000, { installment_id: "a" })],
      },
      date,
    );
    expect(partial.items[0]!.installments[0]!.credit).toBe(50000);
    expect(partial.balance).toBe(50000);
    expect(partial.percent).toBe(75);
  });
  it("distinguishes due date from payment date and reports all due windows", () => {
    const d = {
      ...emptyPlanning(),
      entries: [entry()],
      installments: [
        parcel("late", { amount_cents: 50000, due_on: "2026-10-01" }),
        parcel("soon", { amount_cents: 50000, due_on: "2026-10-30" }),
        parcel("later", { amount_cents: 100000, due_on: "2026-11-15" }),
      ],
      payments: [pay(20000, { installment_id: "late", paid_on: "2026-10-20" })],
    };
    const l = ledger(d, date);
    expect(l.overdue).toBe(30000);
    expect(l.futureAmount).toBe(150000);
    expect(l.future).toHaveLength(2);
    expect(l.due[0]!.id).toBe("late");
    expect(l.items[0]!.difference).toBe(0);
  });
  it("warns about incomplete schedules and never treats unallocated amounts as paid", () => {
    const d = {
      ...emptyPlanning(),
      entries: [entry("e", { agreed_cents: 660000 })],
      installments: [parcel("i", { amount_cents: 500000 })],
    };
    const l = ledger(d, date);
    expect(l.items[0]!.difference).toBe(160000);
    expect(l.balance).toBe(660000);
    expect(l.paid).toBe(0);
  });
  it("caps due indicators on overallocated schedules, keeping the discrepancy visible", () => {
    const l = ledger(
      {
        ...emptyPlanning(),
        entries: [entry()],
        installments: [parcel("a"), parcel("b")],
      },
      date,
    );
    expect(l.futureAmount).toBe(200000);
    expect(l.items[0]!.difference).toBe(-200000);
  });
  it("does not lose real spending on archive, and excludes cancelled payment records", () => {
    const l = ledger(
      {
        ...emptyPlanning(),
        entries: [entry("e", { deleted_at: "2026-10-28" })],
        payments: [pay(50000), pay(70000, { deleted_at: "2026-10-28" })],
      },
      date,
    );
    expect(l.paid).toBe(50000);
    expect(l.balance).toBe(150000);
    const reconciled = ledger(
      {
        ...emptyPlanning(),
        entries: [entry()],
        installments: [
          parcel("past", { amount_cents: 200000, deleted_at: "2026-10-28" }),
          parcel("future", { amount_cents: 150000 }),
        ],
        payments: [pay(50000, { installment_id: "past" })],
      },
      date,
    );
    expect(reconciled.items[0]!.archivedPaid).toBe(50000);
    expect(reconciled.items[0]!.difference).toBe(0);
    expect(reconciled.balance).toBe(150000);
  });
  it("separates budget availability from outstanding financial balance", () => {
    const l = ledger(
      {
        ...emptyPlanning(),
        entries: [entry()],
        payments: [pay(50000)],
        budget: { amount_cents: 250000 } as never,
      },
      date,
    );
    expect(l.available).toBe(50000);
    expect(l.balance).toBe(150000);
    expect(l.used).toBe(80);
    const zero = ledger(
      {
        ...emptyPlanning(),
        entries: [entry()],
        budget: { amount_cents: 0 } as never,
      },
      date,
    );
    expect(zero.exceeded).toBe(200000);
    expect(zero.used).toBeNull();
  });
});
