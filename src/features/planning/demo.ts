// Explicit browser demo only, never a production persistence fallback.
import {
  emptySimple,
  simpleLedger,
  type SimpleData,
  type Vendor,
  type Due,
  type Settlement,
} from "./simpleDomain";
export const demoSimple = (event: string): SimpleData =>
  JSON.parse(
    localStorage.getItem(`demo-planning-simple-${event}`) ||
      JSON.stringify(emptySimple()),
  );
export function demoSimpleAction(
  event: string,
  kind: string,
  id: string,
  version: number | null,
  values: Record<string, unknown>,
) {
  const data = demoSimple(event),
    l = simpleLedger(data),
    now = new Date().toISOString();
  if (kind === "BUDGET_SAVE")
    data.budget = {
      id,
      version: (data.budget?.version || 0) + 1,
      amount_cents: Number(values.amount_cents),
    };
  else if (kind.startsWith("VENDOR")) {
    const old = data.vendors.find((v) => v.id === id);
    if (old && old.version !== version) throw Error("simple_stale");
    if (kind === "VENDOR_DELETE") {
      if (!old) throw Error("simple_stale");
      old.deleted_at = now;
      old.version++;
    } else {
      const dues = values.dues as Due[],
        total = Number(values.total_cents);
      if (dues.reduce((n, d) => n + d.amount_cents, 0) !== total)
        throw Error("simple_plan_difference");
      for (const d of l.dues.filter((d) => d.vendor_id === id && d.paid > 0)) {
        const next = dues.find((n) => n.id === d.id);
        if (!next) throw Error("simple_paid_due");
        if (next.amount_cents < d.paid) throw Error("simple_below_paid");
        if (
          (next.amount_cents !== d.amount_cents ||
            next.due_on !== d.due_on ||
            next.position !== d.position ||
            next.label !== d.label) &&
          !values.confirm_paid
        )
          throw Error("simple_confirm_paid");
      }
      const vendor = {
        ...old,
        id,
        event_id: event,
        name: String(values.name),
        details: values.details,
        total_cents: total,
        plan_type: values.plan_type,
        version: (old?.version || 0) + 1,
        deleted_at: null,
      } as Vendor;
      data.vendors = data.vendors.filter((v) => v.id !== id).concat(vendor);
      data.dues = data.dues.map((d) =>
        d.vendor_id === id && !dues.some((n) => n.id === d.id)
          ? { ...d, deleted_at: now }
          : d,
      );
      for (const due of dues) {
        data.dues = data.dues
          .filter((d) => d.id !== due.id)
          .concat({ ...due, vendor_id: id, event_id: event, deleted_at: null });
      }
    }
  } else {
    const old = data.payments.find((p) => p.id === id);
    if (old && old.version !== version) throw Error("simple_stale");
    if (kind === "PAYMENT_DELETE") {
      if (!old) throw Error("simple_stale");
      old.deleted_at = now;
      old.version++;
    } else {
      const due = data.dues.find((d) => d.id === values.due_id)!;
      const rest = data.payments.filter((p) => p.id !== id && !p.deleted_at);
      if (
        Number(values.amount_cents) +
          rest
            .filter((p) => p.due_id === due.id)
            .reduce((n, p) => n + p.amount_cents, 0) >
        due.amount_cents
      )
        throw Error("simple_overpay");
      data.payments = data.payments
        .filter((p) => p.id !== id)
        .concat({
          ...old,
          ...values,
          id,
          event_id: event,
          vendor_id: due.vendor_id,
          version: (old?.version || 0) + 1,
          deleted_at: null,
        } as Settlement);
    }
  }
  localStorage.setItem(`demo-planning-simple-${event}`, JSON.stringify(data));
  return { id, version: 1 };
}
