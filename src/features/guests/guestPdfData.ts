import { adminRsvpStatus } from "./adminGuestStatus";
import { canExportGuests, type GuestExportData } from "./guestExport";
import {
  filteredGuestExportRows,
  type ExportFilter,
} from "./guestExportFilters";

// Deliberately smaller than the Excel projection: no contacts/access credentials.
export interface GuestPdfRow {
  name: string;
  side: string;
  family: string;
  party: boolean;
  note: string;
}

export function guestPdfRows(
  data: GuestExportData,
  selected: ExportFilter[],
): GuestPdfRow[] {
  if (!canExportGuests(data.role)) throw Error("Exportação não autorizada.");
  const event = data.event.id;
  const rsvps = new Map(
    data.rsvps.filter((r) => r.event_id === event).map((r) => [r.guest_id, r]),
  );
  const units = new Map(
    data.invitations.filter((i) => i.event_id === event).map((i) => [i.id, i]),
  );
  return (
    data.guests
      .filter(
        (g) =>
          g.event_id === event &&
          adminRsvpStatus(rsvps.get(g.id)) === "CONFIRMED",
      )
      // Reuse the existing filter semantics without changing the Excel path or
      // matching by name (homonyms must retain their own family and observation).
      .filter(
        (g) =>
          filteredGuestExportRows({ ...data, guests: [g] }, selected).length >
          0,
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      )
      .map((g) => ({
        name: g.name,
        side: /\bnoiva\b/i.test(g.group_label)
          ? "Noiva"
          : /\bnoivo\b/i.test(g.group_label)
            ? "Noivo"
            : "—",
        family:
          units.get(g.invitation_id)?.kind === "INDIVIDUAL"
            ? "—"
            : units.get(g.invitation_id)?.name?.trim() || "—",
        party: g.party_role === "PADRINHO" || g.party_role === "MADRINHA",
        note: g.admin_notes?.trim() ? g.admin_notes : "",
      }))
  );
}

export function guestPdfSummary(rows: GuestPdfRow[]) {
  return {
    confirmed: rows.length,
    party: rows.filter((r) => r.party).length,
    notes: rows.filter((r) => r.note.trim()).length,
  };
}

export function guestPdfTimestamp(date: Date) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === key)!.value;
  return `${part("day")}/${part("month")}/${part("year")} às ${part("hour")}:${part("minute")}`;
}
