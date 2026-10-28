// Explicit local demonstration only. Production always uses authorized PostgreSQL RPCs.
import { emptyPlanning, type PlanningData, type LedgerRecord } from "./domain";
export function demoPlanning(event: string): PlanningData {
  const saved = localStorage.getItem(`demo-planning-${event}`);
  return saved ? JSON.parse(saved) : emptyPlanning();
}
export function demoPlanningAction(
  event: string,
  kind: string,
  id: string,
  version: number | null,
  values: Record<string, unknown>,
) {
  const data = demoPlanning(event),
    now = new Date().toISOString();
  const entity = kind.split("_")[0]!;
  const key = {
    SUPPLIER: "suppliers",
    ENTRY: "entries",
    INSTALLMENT: "installments",
    PAYMENT: "payments",
    DOCUMENT: "documents",
    BUDGET: "budget",
  }[entity] as keyof PlanningData;
  if (kind === "SCHEDULE_GENERATE") {
    const entry = data.entries.find((e) => e.id === id)!;
    if (data.installments.some((i) => i.entry_id === id && !i.deleted_at))
      throw Error("Já existem parcelas. Edite o cronograma existente.");
    const n = Number(values.quantity),
      total = Math.max(
        0,
        (entry.status === "CANCELLED"
          ? entry.settlement_cents
          : entry.agreed_cents - entry.discount_cents) -
          data.payments
            .filter((p) => p.entry_id === id && !p.deleted_at)
            .reduce((n, p) => n + p.amount_cents, 0),
      );
    if (!Number.isInteger(n) || n < 1 || n > 120 || total < n)
      throw Error("O saldo não permite essas parcelas.");
    for (let j = 0; j < n; j++) {
      const base = String(values.first_due_on),
        date = new Date(base + "T12:00:00Z");
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + j);
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      date.setUTCDate(Math.min(Number(base.slice(-2)), last));
      data.installments.push({
        id: crypto.randomUUID(),
        event_id: event,
        entry_id: id,
        description: `Parcela ${j + 1}`,
        position: j + 1,
        amount_cents: Math.floor(total / n) + (j < total % n ? 1 : 0),
        due_on: date.toISOString().slice(0, 10),
        notes: "",
        version: 1,
        created_at: now,
        updated_at: now,
        created_by: "demo-admin",
        updated_by: "demo-admin",
        deleted_at: null,
      });
    }
    entry.version++;
  } else {
    const rows =
      key === "budget"
        ? data.budget
          ? [data.budget]
          : []
        : (data[key] as LedgerRecord[]);
    const old = rows.find((r) => r.id === id);
    if (old && old.version !== version)
      throw Error("Dados alterados. Atualize antes de editar.");
    const next = {
      ...old,
      ...values,
      id,
      event_id: event,
      version: (old?.version || 0) + 1,
      created_at: old?.created_at || now,
      updated_at: now,
      created_by: "demo-admin",
      updated_by: "demo-admin",
      deleted_at: kind.endsWith("ARCHIVE") ? now : null,
    };
    if (entity === "PAYMENT" && !old) {
      const entry = data.entries.find((e) => e.id === values.entry_id),
        supplier = data.suppliers.find((s) => s.id === entry?.supplier_id);
      Object.assign(next, {
        supplier_id: supplier?.id || null,
        supplier_name: supplier?.name || "",
      });
    }
    delete (next as Record<string, unknown>).allow_overpay;
    if (key === "budget") data.budget = next as PlanningData["budget"];
    else if (old) Object.assign(old, next);
    else rows.push(next as LedgerRecord);
  }
  data.history.unshift({
    id: crypto.randomUUID(),
    actor: "demo-admin",
    actor_name: "Noivos (demo)",
    action: kind,
    entity: `planning_${key}`,
    entity_id: id,
    metadata: {},
    created_at: now,
  });
  localStorage.setItem(`demo-planning-${event}`, JSON.stringify(data));
}
