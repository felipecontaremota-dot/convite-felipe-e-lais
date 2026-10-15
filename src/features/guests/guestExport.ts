import { invitationLink } from "../../utils/security";
import type { Snapshot } from "../../types/domain";
import { listGuests, RSVP_LABELS, formatPhone } from "./adminDomain";

export const guestExportHeaders = [
  "Nº",
  "Nome",
  "WhatsApp",
  "Tag",
  "Convite",
  "Senha",
  "Família",
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
  string,
  string,
];
export function exportWhatsApp(value: string) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const national =
    [12, 13].includes(digits.length) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  return [10, 11].includes(national.length) ? formatPhone(national) : value;
}
// Explicit columns only: never pass a snapshot, administrative/session credentials or complete records to the writer.
export function guestExportRows(
  data: Snapshot | null,
  search: string,
  filter: string,
  baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL || "",
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
        status = rsvps.get(g.id),
        unit = invitations.get(g.invitation_id);
      let link = "";
      if (unit?.sharing_code && unit.link_active !== false && baseUrl) {
        try {
          link = invitationLink(baseUrl, unit.sharing_code);
        } catch {
          /* Missing/invalid access data stays blank. */
        }
      }
      return [
        index + 1,
        g.name || "",
        exportWhatsApp(c?.whatsapp || ""),
        g.group_label || "",
        link,
        unit?.pin || "",
        unit?.name || "",
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
