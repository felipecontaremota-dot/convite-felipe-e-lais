import { expect, it } from "vitest";
import { cents } from "../src/features/planning/domain";
import {
  dueStatus,
  emptySimple,
  monthlyDate,
  paymentRows,
  progressColor,
  splitCents,
  simpleLedger,
  type SimpleData,
  type Vendor,
  type Due,
  type Settlement,
} from "../src/features/planning/simpleDomain";
const vendor = (id: string, name: string, total_cents: number) =>
  ({
    id,
    name,
    total_cents,
    plan_type: "CASH",
    details: {},
    deleted_at: null,
  }) as Vendor;
const due = (
  id: string,
  vendor_id: string,
  amount_cents: number,
  due_on = "2026-11-02",
) =>
  ({
    id,
    vendor_id,
    amount_cents,
    due_on,
    label: id,
    position: 0,
    deleted_at: null,
  }) as Due;
const payment = (
  id: string,
  vendor_id: string,
  due_id: string,
  amount_cents: number,
  paid_on = "2026-10-20",
) =>
  ({
    id,
    vendor_id,
    due_id,
    amount_cents,
    paid_on,
    deleted_at: null,
  }) as Settlement;
it("treats exactly R$ 1.820 as full payment without credit or negative balance", () => {
  const data = {
    ...emptySimple(),
    vendors: [vendor("v", "Villarejo", 182000)],
    dues: [due("d", "v", 182000)],
    payments: [payment("p", "v", "d", 182000)],
  };
  const l = simpleLedger(data);
  expect(l.balance).toBe(0);
  expect(l.percent).toBe(100);
  expect(l.dues[0]?.status).toBe("Pago");
  expect(l.dues[0]?.remaining).toBe(0);
});
it("calculates contract, down payment and two installments once", () => {
  const d = {
    ...emptySimple(),
    vendors: [vendor("v", "Villarejo", 1820000)],
    dues: [due("a", "v", 182000), due("b", "v", 819000), due("c", "v", 819000)],
    payments: [payment("p", "v", "a", 182000)],
  };
  const l = simpleLedger(d);
  expect(l.total).toBe(1820000);
  expect(l.paid).toBe(182000);
  expect(l.balance).toBe(1638000);
  expect(l.percent).toBe(10);
});
it("handles exact cents, partial/complementary payments and guards safe totals", () => {
  const d = {
    ...emptySimple(),
    vendors: [vendor("v", "A", cents("0,30"))],
    dues: [due("d", "v", 30)],
    payments: [
      payment("a", "v", "d", cents("0,10")),
      payment("b", "v", "d", cents("0,20")),
    ],
  };
  expect(simpleLedger(d).balance).toBe(0);
  expect(simpleLedger({ ...d, payments: d.payments.slice(0, 1) }).balance).toBe(
    20,
  );
  expect(() =>
    simpleLedger({ ...d, payments: [payment("x", "v", "d", 31)] }),
  ).toThrow();
});
it.each([
  [0, "2026-01-01", "Pago"],
  [1, "2026-11-01", "Vencido"],
  [1, "2026-11-02", "Vence hoje"],
  [1, "2026-11-03", "Vencimento próximo"],
  [1, "2026-11-07", "Vencimento próximo"],
  [1, "2026-11-08", "Pendente"],
] as const)("calculates status for balance %s / %s", (balance, date, status) =>
  expect(dueStatus(balance, date, "2026-11-02")).toBe(status),
);
it.each([0, 50, 100])(
  "progress %s%% is based on actual payments",
  (percent) => {
    const data = {
      ...emptySimple(),
      vendors: [vendor("v", "A", 10000)],
      dues: [due("d", "v", 10000)],
      payments: percent ? [payment("p", "v", "d", percent * 100)] : [],
    };
    expect(simpleLedger(data).percent).toBe(percent);
  },
);
it("interpolates progress color continuously through amber and green", () => {
  expect(progressColor(0)).toBe("rgb(163, 59, 67)");
  expect(progressColor(50)).toBe("rgb(169, 112, 13)");
  expect(progressColor(100)).toBe("rgb(35, 103, 70)");
  expect(progressColor(20)).not.toBe(progressColor(21));
});
it("keeps original month day across February", () => {
  expect(monthlyDate("2027-01-31", 1)).toBe("2027-02-28");
  expect(monthlyDate("2027-01-31", 2)).toBe("2027-03-31");
});
it("removes deleted supplier/history from indicators without mutating retained rows", () => {
  const data = {
    ...emptySimple(),
    vendors: [{ ...vendor("v", "A", 100), deleted_at: "now" }],
    dues: [due("d", "v", 100)],
    payments: [payment("p", "v", "d", 50)],
  };
  const original = JSON.stringify(data);
  expect(simpleLedger(data).paid).toBe(0);
  expect(paymentRows(data)).toHaveLength(0);
  expect(JSON.stringify(data)).toBe(original);
});
it("sorts payments in every direction with deterministic ties and no future dues in history", () => {
  const data: SimpleData = {
    ...emptySimple(),
    vendors: [vendor("a", "Ágata", 500), vendor("z", "Zebra", 500)],
    dues: [
      due("a", "a", 500, "2026-12-01"),
      due("z", "z", 500, "2026-11-01"),
      due("future", "a", 500, "2027-01-01"),
    ],
    payments: [
      payment("z", "z", "z", 20, "2026-10-01"),
      payment("a", "a", "a", 10, "2026-10-02"),
    ],
  };
  expect(paymentRows(data).map((p) => p.vendor)).toEqual(["Ágata", "Zebra"]);
  expect(paymentRows(data, "vendor", true)[0]?.vendor).toBe("Zebra");
  expect(paymentRows(data, "due")[0]?.id).toBe("z");
  expect(paymentRows(data, "due", true)[0]?.id).toBe("a");
  expect(paymentRows(data, "paid")[0]?.id).toBe("z");
  expect(paymentRows(data, "paid", true)[0]?.id).toBe("a");
  expect(paymentRows(data, "amount")[0]?.id).toBe("a");
  expect(paymentRows(data, "amount", true)[0]?.id).toBe("z");
  expect(paymentRows(data)).toHaveLength(2);
});

it("distributes cents exactly, including non-divisible amounts", () => {
  expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
  expect(splitCents(450000, 3)).toEqual([150000, 150000, 150000]);
  expect(() => splitCents(1, 3)).toThrow();
});

it("preserves explicit plan order independently of the dashboard due-date order", () => {
  const data = {
    ...emptySimple(),
    vendors: [vendor("v", "A", 200)],
    dues: [
      { ...due("first", "v", 100, "2026-12-01"), position: 0 },
      { ...due("second", "v", 100, "2026-11-01"), position: 1 },
    ],
  };
  const l = simpleLedger(data, "2026-10-01");
  expect(l.vendors[0]?.dues.map((d) => d.id)).toEqual(["first", "second"]);
  expect(l.upcoming.map((d) => d.id)).toEqual(["second", "first"]);
});
