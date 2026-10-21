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
    empty: "Nenhum convite marcado como enviado.",
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
    lists[guest.invitation_sent ? "sent" : "unsent"].push(guest);
  }
  for (const list of Object.values(lists))
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { lists, invitations, status };
}
