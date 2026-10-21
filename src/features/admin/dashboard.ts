import type { Guest, Snapshot } from "../../types/domain";
import { effectiveResponse } from "../rsvp/presenceContent";

export type DashboardCategory =
  "confirmed" | "declined" | "unanswered" | "deciding" | "unsent" | "sent";
export const dashboardCategories: Record<
  DashboardCategory,
  { label: string; title: string; empty: string }
> = {
  confirmed: {
    label: "Confirmados",
    title: "Convidados confirmados",
    empty: "Nenhum convidado confirmou presença até o momento.",
  },
  declined: {
    label: "Não irão",
    title: "Convidados que não irão",
    empty: "Nenhum convidado informou que não poderá comparecer.",
  },
  unanswered: {
    label: "Pendentes",
    title: "Convidados pendentes",
    empty: "Todos os convidados já responderam!",
  },
  deciding: {
    label: "Talvez irão",
    title: "Convidados que talvez irão",
    empty: "Nenhum convidado está indeciso no momento.",
  },
  sent: {
    label: "Convidados",
    title: "Convidados com convite enviado",
    empty: "Nenhum convidado com convite enviado e sem recusa de presença.",
  },
  unsent: {
    label: "Convites não enviados",
    title: "Convites não enviados",
    empty: "Todos os convites já foram enviados!",
  },
};
export function dashboardDetails(snapshot: Snapshot | null | undefined) {
  const lists: Record<DashboardCategory, Guest[]> = {
    confirmed: [],
    declined: [],
    unanswered: [],
    deciding: [],
    unsent: [],
    sent: [],
  };
  const guests = snapshot?.guests ?? [];
  const records = new Map(snapshot?.rsvps.map((r) => [r.guest_id, r]));
  const invitations = new Map(snapshot?.invitations.map((i) => [i.id, i]));
  const status = new Map<string, string>();
  for (const guest of guests) {
    const response = effectiveResponse(guest.id, records.get(guest.id), []);
    const category =
      response.status === "CONFIRMED"
        ? "confirmed"
        : response.status === "DECLINED"
          ? "declined"
          : response.answered
            ? "deciding"
            : "unanswered";
    lists[category].push(guest);
    status.set(
      guest.id,
      {
        confirmed: "Confirmado",
        declined: "Não irá",
        unanswered: "Ainda não respondeu",
        deciding: "Talvez irá",
      }[category],
    );
    if (!guest.invitation_sent) lists.unsent.push(guest);
    else if (category !== "declined") lists.sent.push(guest);
  }
  for (const list of Object.values(lists))
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // Keep the requested arithmetic, including double deductions. Never truncate
  // the eligible list or clamp the indicator to conceal an overlap.
  const counts = {
    confirmed: lists.confirmed.length,
    declined: lists.declined.length,
    unanswered: lists.unanswered.length,
    deciding: lists.deciding.length,
    unsent: lists.unsent.length,
    total: guests.length,
    sent: guests.length - lists.unsent.length - lists.declined.length,
  } satisfies Record<DashboardCategory | "total", number>;
  const doubleDeduction = lists.unsent.filter(
    (guest) => records.get(guest.id)?.status === "DECLINED",
  ).length;
  return { lists, counts, doubleDeduction, invitations, status };
}
