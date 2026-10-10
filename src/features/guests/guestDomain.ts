import { effectiveRsvpStatus } from "../rsvp/domain";
import type { Snapshot, RSVP } from "../../types/domain";
export function guestGreeting(s: Snapshot | null) {
  const unit = s?.invitations[0];
  const person = s?.guests.find((g) => g.id === unit?.primary_guest_id);
  if (unit?.kind === "FAMILY")
    return person
      ? `Bem-vindos, ${person.name} e família`
      : `Bem-vindos, ${unit.name || "à nossa celebração"}`;
  if (!person) return "Boas-vindas à nossa celebração";
  return `${person.salutation === "MALE" ? "Bem-vindo" : person.salutation === "FEMALE" ? "Bem-vinda" : "Boas-vindas"}, ${person.name}`;
}
export function homeRsvp(s: Snapshot | null) {
  const statuses =
    s?.guests.map((g) =>
      effectiveRsvpStatus(s.rsvps.find((r) => r.guest_id === g.id)),
    ) || [];
  const family = s?.invitations[0]?.kind === "FAMILY";
  const status: RSVP =
    statuses.length && statuses.every((x) => x === statuses[0])
      ? statuses[0]!
      : "PENDING";
  if (family && statuses.some((x) => x !== statuses[0]))
    return "Sua família ainda possui confirmações pendentes ou diferentes";
  if (family)
    return {
      CONFIRMED: "Sua presença e a de sua família estão confirmadas",
      DECLINED:
        "Sua ausência e a de sua família foram confirmadas, sentiremos a falta de vocês",
      MAYBE:
        "Ainda dá tempo de você confirmar a sua presença e a de sua família",
      PENDING: "Sua presença e a de sua família ainda não estão confirmadas",
    }[status];
  return {
    CONFIRMED: "Sua presença está confirmada",
    DECLINED: "Sua ausência foi confirmada, sentiremos sua falta",
    MAYBE: "Ainda dá tempo de você confirmar sua presença",
    PENDING: "Sua presença ainda não foi confirmada",
  }[status];
}
