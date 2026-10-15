import type { Snapshot } from "../../types/domain";
import { listGuests, RSVP_LABELS } from "./adminDomain";

export const guestExportHeaders = [
  "Nº",
  "Nome completo",
  "Família / Unidade de acesso",
  "Tag",
  "WhatsApp",
  "E-mail",
  "Presença",
  "Tipo",
];
export type GuestExportRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
// An explicit allowlist: never pass a snapshot, credentials or complete records to the writer.
export function guestExportRows(
  data: Snapshot | null,
  search: string,
  filter: string,
): GuestExportRow[] {
  if (data?.role !== "ADMIN") throw Error("Exportação não autorizada.");
  const event = data.event.id;
  const invitations = new Map(
    data.invitations.filter((i) => i.event_id === event).map((i) => [i.id, i]),
  );
  const contacts = new Map(data.contacts.map((c) => [c.guest_id, c]));
  const rsvps = new Map(
    data.rsvps
      .filter((r) => r.event_id === event)
      .map((r) => [r.guest_id, r.status]),
  );
  return listGuests(data, search, filter)
    .filter((g) => g.event_id === event)
    .map((g, index) => {
      const c = contacts.get(g.id),
        status = rsvps.get(g.id);
      return [
        index + 1,
        g.name || "",
        invitations.get(g.invitation_id)?.name || "",
        g.group_label || "",
        c?.whatsapp || "",
        c?.email || "",
        status ? RSVP_LABELS[status] || "" : RSVP_LABELS.PENDING,
        g.is_child
          ? "Criança"
          : g.is_adolescent
            ? "Adolescente"
            : g.is_child === false
              ? "Adulto"
              : "",
      ];
    });
}
export function exportDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
export function guestExportFilename(date: Date) {
  return `Felipe_e_Lais_Lista_de_Convidados_${exportDate(date).replaceAll("/", "-")}.xlsx`;
}
