export interface LedgerRecord {
  id: string;
  event_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}
export interface Supplier extends LedgerRecord {
  name: string;
  responsible: string;
  tax_id: string;
  category: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  pix_type: string;
  pix_key: string;
  holder_name: string;
  holder_tax_id: string;
  bank: string;
  agency: string;
  account: string;
  notes: string;
}
export const contractStates = {
  PLANNED: "Planejado",
  QUOTED: "Orçamento solicitado",
  NEGOTIATING: "Em negociação",
  CONTRACTED: "Contratado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
} as const;
export type ContractState = keyof typeof contractStates;
export interface Entry extends LedgerRecord {
  kind: "SERVICE" | "EXPENSE";
  title: string;
  category: string;
  description: string;
  supplier_id: string | null;
  status: ContractState;
  contracted_on: string | null;
  delivery_on: string | null;
  notes: string;
  estimated_cents: number;
  agreed_cents: number;
  discount_cents: number;
  settlement_cents: number;
  payment_method: string;
  financial_notes: string;
}
export interface Installment extends LedgerRecord {
  entry_id: string;
  description: string;
  position: number;
  amount_cents: number;
  due_on: string;
  notes: string;
}
export interface Payment extends LedgerRecord {
  supplier_id: string | null;
  supplier_name: string;
  entry_id: string;
  installment_id: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  notes: string;
}
export interface PlanningDocument extends LedgerRecord {
  supplier_id: string | null;
  entry_id: string | null;
  payment_id: string | null;
  name: string;
  mime: string;
  size_bytes: number;
  state: "PENDING" | "READY";
}
export interface Budget extends LedgerRecord {
  amount_cents: number;
}
export interface History {
  id: string;
  actor: string;
  actor_name?: string;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface PlanningData {
  suppliers: Supplier[];
  entries: Entry[];
  installments: Installment[];
  payments: Payment[];
  documents: PlanningDocument[];
  budget: Budget | null;
  history: History[];
}
export const emptyPlanning = (): PlanningData => ({
  suppliers: [],
  entries: [],
  installments: [],
  payments: [],
  documents: [],
  budget: null,
  history: [],
});
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function cents(value: string): number {
  const s = value.trim().replace(/^R\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))
    throw Error("Informe um valor monetário válido, como 1.234,56.");
  const [whole, fraction = ""] = s.replaceAll(".", "").split(",");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 99999999999)
    throw Error("Valor monetário acima do limite permitido.");
  return n;
}
export const moneyInput = (n: number) =>
  (n / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const todaySP = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const day = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
export const timestamp = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export const maskDate = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2");
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const sum = (values: number[]) => {
  const total = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total))
    throw Error("Total excede a precisão financeira suportada.");
  return total;
};
export const committed = (entry: Entry) =>
  entry.status === "CANCELLED"
    ? entry.settlement_cents
    : ["CONTRACTED", "COMPLETED"].includes(entry.status)
      ? entry.agreed_cents - entry.discount_cents
      : 0;
export function ledger(data: PlanningData, today = todaySP()) {
  const items = data.entries.map((entry) => {
    const payments = data.payments.filter(
      (p) => p.entry_id === entry.id && !p.deleted_at,
    );
    const paid = sum(payments.map((p) => p.amount_cents)),
      obligation = committed(entry);
    const balance = Math.max(0, obligation - paid),
      credit = Math.max(0, paid - obligation);
    let allocated = 0;
    const installments = data.installments
      .filter((i) => i.entry_id === entry.id && !i.deleted_at)
      .sort(
        (a, b) => a.due_on.localeCompare(b.due_on) || a.position - b.position,
      )
      .map((i) => {
        const paid = sum(
          payments
            .filter((p) => p.installment_id === i.id)
            .map((p) => p.amount_cents),
        );
        const remaining = Math.max(0, i.amount_cents - paid),
          due = Math.min(remaining, Math.max(0, balance - allocated));
        allocated += due;
        return {
          ...i,
          paid,
          remaining,
          credit: Math.max(0, paid - i.amount_cents),
          due,
          status:
            remaining === 0
              ? "Pago"
              : i.due_on < today
                ? "Vencido"
                : paid > 0
                  ? "Parcialmente pago"
                  : "Pendente",
        };
      });
    const overdue = sum(
      installments.filter((i) => i.due_on < today).map((i) => i.due),
    );
    const scheduled = sum(installments.map((i) => i.amount_cents));
    const archivedPaid = sum(
      payments
        .filter((p) =>
          data.installments.some(
            (i) => i.id === p.installment_id && !!i.deleted_at,
          ),
        )
        .map((p) => p.amount_cents),
    );
    const status =
      entry.status === "CANCELLED" && !balance
        ? "Cancelado"
        : !obligation
          ? "Pendente"
          : !balance
            ? "Pago"
            : overdue
              ? "Vencido"
              : paid
                ? "Parcialmente pago"
                : "Pendente";
    return {
      entry,
      paid,
      obligation,
      balance,
      credit,
      overdue,
      installments,
      difference: obligation - scheduled - archivedPaid,
      archivedPaid,
      scheduled,
      status,
      percent: obligation
        ? Math.min(100, Math.round((100 * paid) / obligation))
        : 0,
    };
  });
  const obligations = sum(items.map((i) => i.obligation)),
    paid = sum(items.map((i) => i.paid));
  const due = items
    .flatMap((i) =>
      i.installments
        .filter((p) => p.due > 0)
        .map((p) => ({ ...p, entry: i.entry })),
    )
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const future = due.filter((i) => i.due_on >= today);
  const planned =
    obligations +
    sum(
      items
        .filter(
          (i) =>
            !i.entry.deleted_at &&
            ["PLANNED", "QUOTED", "NEGOTIATING"].includes(i.entry.status),
        )
        .map(
          (i) =>
            i.entry.estimated_cents ||
            i.entry.agreed_cents - i.entry.discount_cents,
        ),
    );
  const budget = data.budget?.amount_cents ?? null;
  return {
    items,
    planned,
    budget,
    committed: obligations,
    paid,
    balance: sum(items.map((i) => i.balance)),
    credit: sum(items.map((i) => i.credit)),
    overdue: sum(items.map((i) => i.overdue)),
    future,
    due,
    futureAmount: sum(future.map((i) => i.due)),
    available: budget === null ? null : Math.max(0, budget - obligations),
    exceeded: budget === null ? 0 : Math.max(0, obligations - budget),
    used:
      budget && budget > 0
        ? Math.round((100 * obligations) / budget)
        : budget === 0 && obligations === 0
          ? 0
          : null,
    percent: obligations
      ? Math.min(
          100,
          Math.round(
            (100 * sum(items.map((i) => Math.min(i.paid, i.obligation)))) /
              obligations,
          ),
        )
      : 0,
  };
}
export function validTax(value: string): boolean {
  if (!/^(?:\d{11}|\d{14})$/.test(value) || new Set(value).size === 1)
    return false;
  for (let stage = 1; stage <= 2; stage++) {
    let total = 0;
    const n = value.length;
    for (let j = 1; j <= n - 3 + stage; j++)
      total +=
        Number(value[j - 1]) *
        (n === 11 ? n - 1 + stage - j : ((n - 3 + stage - j) % 8) + 2);
    if (
      (total % 11 < 2 ? 0 : 11 - (total % 11)) !== Number(value[n - 3 + stage])
    )
      return false;
  }
  return true;
}
export const maskTax = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length <= 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};
export function pixKey(type: string, value: string) {
  const key =
    type === "CPF" || type === "CNPJ"
      ? value.replace(/\D/g, "")
      : type === "PHONE"
        ? value.trim().replace(/[()\s-]/g, "")
        : value.trim();
  if (
    (!type && key) ||
    (type && !key) ||
    (["CPF", "CNPJ"].includes(type) &&
      (key.length !== (type === "CPF" ? 11 : 14) || !validTax(key))) ||
    (type === "PHONE" && !/^\+[1-9]\d{9,14}$/.test(key)) ||
    (type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) ||
    (type === "RANDOM" &&
      !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(key))
  )
    throw Error("Confira o tipo e o valor da chave PIX.");
  return key;
}
