import type { Snapshot } from "../../types/domain";
import { adminRsvpStatus } from "../guests/adminGuestStatus";
export const operationalName = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export function operationalGuests(
  data: Snapshot | null,
  search = "",
  filter = "CONFIRMED",
  partyOnly = false,
) {
  const query = operationalName(search);
  return (data?.guests || [])
    .filter((g) => {
      const unit = data?.invitations.find((i) => i.id === g.invitation_id);
      const status = adminRsvpStatus(
        data?.rsvps.find((r) => r.guest_id === g.id),
      );
      return (
        !!unit?.active &&
        !unit.archived_at &&
        (!partyOnly ||
          g.party_role === "PADRINHO" ||
          g.party_role === "MADRINHA") &&
        (filter === "ALL" || status === filter) &&
        operationalName(`${g.name} ${unit.name}`).includes(query)
      );
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
}
