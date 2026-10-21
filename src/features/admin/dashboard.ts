import type { Guest, Snapshot } from "../../types/domain";
import { effectiveResponse } from "../rsvp/presenceContent";

export type DashboardCategory =
  | "confirmed"
  | "declined"
  | "unanswered"
  | "deciding"
  | "unsent"
  | "sent"
  | "bride"
  | "groom";
export const dashboardCategories: Record<
  DashboardCategory,
  { label: string; title: string; empty: string }
> = {
  bride: {
    label: "Convidados da noiva",
    title: "Convidados da noiva",
    empty:
      "Nenhum convidado elegível com a classificação Convidado(a) da noiva.",
  },
  groom: {
    label: "Convidados do noivo",
    title: "Convidados do noivo",
    empty:
      "Nenhum convidado elegível com a classificação Convidado(a) do noivo.",
  },
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
    bride: [],
    groom: [],
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
    if (category !== "unanswered" || guest.invitation_sent)
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
  const originLabels = {
    bride: "Convidado(a) da noiva",
    groom: "Convidado(a) do noivo",
  } as const;
  const originCounts = { bride: 0, groom: 0 };
  const overlaps = { sent: 0, bride: 0, groom: 0 };
  overlaps.sent = lists.unsent.filter(
    (g) => records.get(g.id)?.status === "DECLINED",
  ).length;
  for (const origin of ["bride", "groom"] as const) {
    const people = guests.filter((g) => g.group_label === originLabels[origin]);
    const unsent = people.filter((g) => !g.invitation_sent);
    const declined = people.filter(
      (g) => records.get(g.id)?.status === "DECLINED",
    );
    originCounts[origin] = people.length - unsent.length - declined.length;
    overlaps[origin] = unsent.filter(
      (g) => records.get(g.id)?.status === "DECLINED",
    ).length;
    lists[origin] = lists.sent.filter(
      (g) => g.group_label === originLabels[origin],
    );
  }
  for (const list of Object.values(lists))
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // Keep the requested arithmetic, including double deductions. Never truncate
  // the eligible list or clamp the indicator to conceal an overlap.
  const counts = {
    ...originCounts,
    confirmed: lists.confirmed.length,
    declined: lists.declined.length,
    unanswered: lists.unanswered.length,
    deciding: lists.deciding.length,
    unsent: lists.unsent.length,
    total: guests.length,
    sent: guests.length - lists.unsent.length - lists.declined.length,
  } satisfies Record<DashboardCategory | "total", number>;
  const doubleDeduction = overlaps.sent;
  return {
    lists,
    counts,
    doubleDeduction,
    overlaps,
    invitations,
    status,
    unclassified: guests.filter((g) => !g.group_label).length,
    otherClassifications: guests.filter(
      (g) =>
        !!g.group_label &&
        !Object.values(originLabels).some((label) => label === g.group_label),
    ).length,
  };
}
