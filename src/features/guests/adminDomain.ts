import { z } from "zod";
import type { Snapshot, Guest } from "../../types/domain";
export { brazilPhone, formatPhone } from "../../utils/phone";
export const GROUPS = [
  "Familiar da noiva",
  "Familiar do noivo",
  "Convidado(a) da noiva",
  "Convidado(a) do noivo",
];
export const RSVP_LABELS = {
  PENDING: "Pendente",
  MAYBE: "Ainda decidirei",
  CONFIRMED: "Confirmado",
  DECLINED: "Não irá",
};
export const guestContact = z.object({
  email: z.union([z.literal(""), z.string().email()]),
  whatsapp: z.string().regex(/^(?:[0-9]{10,11})?$/),
});
export function listGuests(
  data: Snapshot | null,
  search: string,
  filter: string,
): Guest[] {
  const query = search.toLocaleLowerCase("pt-BR");
  return (data?.guests || [])
    .filter(
      (g) =>
        `${g.name} ${data?.invitations.find((i) => i.id === g.invitation_id)?.name || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query) &&
        (filter === "ALL" ||
          g.group_label === filter ||
          data?.rsvps.some((r) => r.guest_id === g.id && r.status === filter)),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
}
export function expectedGuests(data: Snapshot, ids: string[]) {
  return ids.map((id) => {
    const g = data.guests.find((g) => g.id === id)!;
    return {
      id,
      version: g.version,
      invitation_version: data.invitations.find(
        (i) => i.id === g.invitation_id,
      )!.version,
    };
  });
}
