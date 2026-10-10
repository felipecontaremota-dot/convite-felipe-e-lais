import { z } from "zod";
import type { Snapshot, Guest } from "../../types/domain";
import { normalizePhone } from "../../utils/security";
export const GROUPS = [
  "Familiar da noiva",
  "Familiar do noivo",
  "Convidado(a) da noiva",
  "Convidado(a) do noivo",
];
export const RSVP_LABELS = {
  PENDING: "Pendente",
  MAYBE: "Ainda vou decidir",
  CONFIRMED: "Confirmado",
  DECLINED: "Não irá",
};
export function brazilPhone(value: string) {
  const digits = normalizePhone(value);
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
}
export function formatPhone(value: string) {
  const p = brazilPhone(value);
  // Do not silently truncate a pasted/legacy phone; validation must reject it.
  if (p.length > 11) return value;
  if (!p) return "";
  if (p.length < 3) return `(${p}`;
  const prefix = `(${p.slice(0, 2)}) `;
  const rest = p.slice(2);
  if (rest.length <= 8)
    return (
      prefix + rest.slice(0, 4) + (rest.length > 4 ? "-" + rest.slice(4) : "")
    );
  return (
    prefix + rest.slice(0, 1) + " " + rest.slice(1, 5) + "-" + rest.slice(5)
  );
}
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
