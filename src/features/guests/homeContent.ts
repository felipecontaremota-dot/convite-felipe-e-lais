import type { Guest, Invitation, OfflineMutation } from "../../types/domain";

export function homeGreeting(
  invitation: Invitation | undefined,
  guests: Guest[],
) {
  const members = guests.filter((g) => g.invitation_id === invitation?.id);
  if (invitation?.kind === "INDIVIDUAL") {
    const person =
      members.find((g) => g.id === invitation.primary_guest_id) ?? members[0];
    if (!person) return "Boas-vindas à nossa celebração";
    const welcome =
      person.greeting_form === "MASCULINE"
        ? "Bem-vindo"
        : person.greeting_form === "FEMININE"
          ? "Bem-vinda"
          : "Boas-vindas";
    return `${welcome}, ${person.name}`;
  }
  const responsible = members.find(
    (g) => g.id === invitation?.primary_guest_id,
  );
  if (responsible) return `Bem-vindos, ${responsible.name} e família`;
  return invitation?.name
    ? `Bem-vindos, ${invitation.name}`
    : "Boas-vindas à nossa celebração";
}

type Presence = "CONFIRMED" | "DECLINED" | "UNANSWERED" | "DECIDING";
function presenceFor(
  guest: Guest,
  records: import("../../types/domain").RsvpRecord[],
  pending: OfflineMutation[],
): Presence {
  const record = records.find((r) => r.guest_id === guest.id);
  const queued = [...pending]
    .reverse()
    .find(
      (item) =>
        item.type === "RSVP_UPDATE" && item.payload.guest_id === guest.id,
    );
  const status = queued?.payload.status ?? record?.status;
  if (status === "CONFIRMED" || status === "DECLINED") return status;
  // The existing queue is evidence of an explicit local response, not a server timestamp.
  return queued?.payload.status === "PENDING" || record?.responded_at
    ? "DECIDING"
    : "UNANSWERED";
}
const individualMessages: Record<Presence, string> = {
  CONFIRMED: "Sua presença está confirmada.",
  DECLINED: "Sua ausência foi confirmada, sentiremos sua falta.",
  UNANSWERED: "Sua presença ainda não foi confirmada.",
  DECIDING: "Ainda dá tempo de você confirmar sua presença.",
};
const familyMessages: Record<Presence, string> = {
  CONFIRMED: "Sua presença e de sua família está confirmada.",
  DECLINED:
    "Sua ausência e de sua família foi confirmada, sentiremos suas faltas.",
  UNANSWERED: "Sua presença e de sua família ainda não está confirmada.",
  DECIDING: "Ainda dá tempo de você confirmar a sua presença e de sua família.",
};
export function homePresence(
  invitation: Invitation | undefined,
  guests: Guest[],
  records: import("../../types/domain").RsvpRecord[],
  pending: OfflineMutation[] = [],
) {
  const members = guests.filter((g) => g.invitation_id === invitation?.id);
  if (invitation?.kind === "INDIVIDUAL") {
    const person =
      members.find((g) => g.id === invitation.primary_guest_id) ?? members[0];
    return individualMessages[
      person ? presenceFor(person, records, pending) : "UNANSWERED"
    ];
  }
  const states = members.map((g) => presenceFor(g, records, pending));
  if (!states.length) return familyMessages.UNANSWERED;
  if (states.every((state) => state === states[0]))
    return familyMessages[states[0]!];
  const count = (state: Presence) => states.filter((s) => s === state).length;
  const summary = [
    [count("CONFIRMED"), "presença confirmada", "presenças confirmadas"],
    [count("DECLINED"), "ausência confirmada", "ausências confirmadas"],
    [count("UNANSWERED"), "ainda não confirmada", "ainda não confirmadas"],
    [count("DECIDING"), "ainda decidindo", "ainda decidindo"],
  ] as const;
  return summary
    .filter(([total]) => total > 0)
    .map(
      ([total, singular, plural]) =>
        `${total} ${total === 1 ? singular : plural}`,
    )
    .join(" · ");
}
