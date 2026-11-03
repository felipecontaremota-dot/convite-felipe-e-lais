import { addDays, todaySP } from "./domain";
export interface Vendor {
  id: string;
  event_id: string;
  name: string;
  details: Record<string, string>;
  total_cents: number;
  plan_type: "CASH" | "DOWN" | "INSTALLMENTS";
  version: number;
  deleted_at: string | null;
}
export interface Due {
  id: string;
  event_id: string;
  vendor_id: string;
  label: string;
  amount_cents: number;
  due_on: string;
  position: number;
  deleted_at: string | null;
}
export interface Settlement {
  id: string;
  event_id: string;
  vendor_id: string;
  due_id: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  notes: string;
  version: number;
  deleted_at: string | null;
}
export interface SimpleData {
  vendors: Vendor[];
  dues: Due[];
  payments: Settlement[];
  budget: { id: string; version: number; amount_cents: number } | null;
  legacy_count: number;
}
export const emptySimple = (): SimpleData => ({
  vendors: [],
  dues: [],
  payments: [],
  budget: null,
  legacy_count: 0,
});
export const sum = (values: number[]) => {
  const n = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(n))
    throw Error("Total acima do limite monetário seguro.");
  return n;
};
export function dueStatus(remaining: number, due: string, today = todaySP()) {
  if (remaining === 0) return "Pago";
  if (due < today) return "Vencido";
  if (due === today) return "Vence hoje";
  if (due <= addDays(today, 5)) return "Vencimento próximo";
  return "Pendente";
}
export function simpleLedger(data: SimpleData, today = todaySP()) {
  const vendors = data.vendors.filter((v) => !v.deleted_at);
  const payments = data.payments.filter(
    (p) => !p.deleted_at && vendors.some((v) => v.id === p.vendor_id),
  );
  const dues = data.dues
    .filter((d) => !d.deleted_at && vendors.some((v) => v.id === d.vendor_id))
    .map((d) => {
      const paid = sum(
        payments.filter((p) => p.due_id === d.id).map((p) => p.amount_cents),
      );
      if (paid > d.amount_cents)
        throw Error(
          "Pagamento superior ao vencimento. Atualize o planejamento.",
        );
      const remaining = d.amount_cents - paid;
      return {
        ...d,
        paid,
        remaining,
        status: dueStatus(remaining, d.due_on, today),
      };
    })
    .sort(
      (a, b) =>
        a.due_on.localeCompare(b.due_on) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const rows = vendors.map((v) => {
    const paid = sum(
      payments.filter((p) => p.vendor_id === v.id).map((p) => p.amount_cents),
    );
    if (paid > v.total_cents)
      throw Error("Pagamento superior ao contrato. Atualize o planejamento.");
    return {
      ...v,
      paid,
      balance: v.total_cents - paid,
      dues: dues
        .filter((d) => d.vendor_id === v.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    };
  });
  const total = sum(rows.map((v) => v.total_cents)),
    paid = sum(payments.map((p) => p.amount_cents));
  return {
    vendors: rows,
    dues,
    payments,
    total,
    paid,
    balance: total - paid,
    percent: total ? (paid / total) * 100 : 0,
    overdue: dues.filter((d) => d.status === "Vencido"),
    upcoming: dues.filter((d) => d.remaining > 0 && d.due_on >= today),
  };
}
export type PaySort = "vendor" | "due" | "paid" | "amount";
export function paymentRows(
  data: SimpleData,
  key: PaySort = "vendor",
  descending = false,
) {
  const l = simpleLedger(data);
  return l.payments
    .map((p) => ({
      ...p,
      vendor: l.vendors.find((v) => v.id === p.vendor_id)!.name,
      due: data.dues.find((d) => d.id === p.due_id)!.due_on,
    }))
    .sort((a, b) => {
      const primary =
        key === "amount"
          ? a.amount_cents - b.amount_cents
          : key === "vendor"
            ? a.vendor.localeCompare(b.vendor, "pt-BR", { sensitivity: "base" })
            : key === "due"
              ? a.due.localeCompare(b.due)
              : a.paid_on.localeCompare(b.paid_on);
      return (
        (descending ? -primary : primary) ||
        a.paid_on.localeCompare(b.paid_on) ||
        a.due.localeCompare(b.due) ||
        a.id.localeCompare(b.id)
      );
    });
}
export function progressColor(percent: number) {
  const t = Math.max(0, Math.min(100, percent)) / 100;
  const stops = [
    [163, 59, 67],
    [169, 112, 13],
    [35, 103, 70],
  ];
  const pair = t <= 0.5 ? 0 : 1,
    amount = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  return `rgb(${stops[pair]!.map((c, i) => Math.round(c + (stops[pair + 1]![i]! - c) * amount)).join(", ")})`;
}
export function monthlyDate(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(Number(iso.slice(-2)), end));
  return d.toISOString().slice(0, 10);
}
export const simpleError = (e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    simple_duplicate:
      "Já existe um cadastro com esse nome ou CPF/CNPJ. Reutilize o fornecedor existente.",
    simple_overpay:
      "O valor pago é superior ao saldo devido. Confira o saldo indicado.",
    simple_plan_difference:
      "A soma dos vencimentos deve ser igual ao valor total do contrato.",
    simple_below_paid:
      "O valor não pode ficar abaixo dos pagamentos já registrados.",
    simple_paid_due:
      "Esta parcela tem pagamentos. Cancele os registros explicitamente antes de excluí-la.",
    simple_confirm_paid:
      "Confirme o ajuste do plano que possui pagamentos registrados.",
    simple_stale:
      "Dados alterados. Feche o formulário, atualize e tente novamente.",
    simple_future_payment: "A data do pagamento não pode estar no futuro.",
    simple_tax: "Confira o CPF/CNPJ informado.",
    simple_pix: "Confira o tipo e a chave PIX.",
    simple_email: "Confira o e-mail informado.",
    simple_invalid: "Confira os campos do fornecedor e do plano financeiro.",
    simple_busy:
      "O planejamento está sendo atualizado. Aguarde e tente novamente.",
  };
  for (const [code, text] of Object.entries(map))
    if (message.includes(code)) return text;
  return message.includes("unauthorized") ? "Acesso não autorizado." : message;
};

export function splitCents(total: number, count: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 120 ||
    (total > 0 && total < count)
  )
    throw Error("O valor não permite essa quantidade de parcelas.");
  return Array.from(
    { length: count },
    (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0),
  );
}
