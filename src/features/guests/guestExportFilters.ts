import type { Snapshot } from "../../types/domain";
import { adminRsvpStatus } from "./adminGuestStatus";
import { guestExportRows } from "./guestExport";

export const exportFilterColumns = [
  ["Todos", "Familiar da noiva", "Familiar do noivo", "Convidado(a) da noiva"],
  ["Convidado(a) do noivo", "Confirmados", "Não irão", "Pendentes"],
  ["Talvez", "Convites enviados", "Convites não enviados", "Padrinho/Madrinha"],
] as const;
export type ExportFilter = (typeof exportFilterColumns)[number][number];
export function toggleExportFilter(
  selected: ExportFilter[],
  value: ExportFilter,
): ExportFilter[] {
  if (selected.includes(value))
    return selected.filter((item) => item !== value);
  return value === "Todos"
    ? [value]
    : [...selected.filter((item) => item !== "Todos"), value];
}
export function filteredGuestExportRows(
  data: Snapshot,
  selected: ExportFilter[],
  baseUrl?: string,
) {
  if (data.role !== "ADMIN") throw Error("Exportação não autorizada.");
  if (!selected.length) return [];
  const groups = selected.filter(
    (value) =>
      value.startsWith("Familiar ") || value.startsWith("Convidado(a) "),
  );
  const statuses = {
    Confirmados: "CONFIRMED",
    "Não irão": "DECLINED",
    Pendentes: "PENDING",
    Talvez: "MAYBE",
  } as const;
  const rsvp = selected.flatMap((value) =>
    value in statuses ? [statuses[value as keyof typeof statuses]] : [],
  );
  const sent = selected.includes("Convites enviados"),
    unsent = selected.includes("Convites não enviados");
  const records = new Map(
    data.rsvps
      .filter((r) => r.event_id === data.event.id)
      .map((r) => [r.guest_id, r]),
  );
  const guests = data.guests.filter(
    (g) =>
      selected.includes("Todos") ||
      ((!groups.length || groups.includes(g.group_label as ExportFilter)) &&
        (!rsvp.length || rsvp.includes(adminRsvpStatus(records.get(g.id)))) &&
        (!(sent || unsent) || (g.invitation_sent ? sent : unsent)) &&
        (!selected.includes("Padrinho/Madrinha") ||
          g.party_role === "PADRINHO" ||
          g.party_role === "MADRINHA")),
  );
  return guestExportRows({ ...data, guests }, "", "ALL", baseUrl);
}
