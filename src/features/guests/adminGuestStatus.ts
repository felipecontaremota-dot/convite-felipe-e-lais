import type { RsvpRecord } from "../../types/domain";
export type AdminRsvpStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "MAYBE";
export const adminRsvpOptions: { value: AdminRsvpStatus; label: string }[] = [
  { value: "PENDING", label: "Pendente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "DECLINED", label: "Não irá" },
  { value: "MAYBE", label: "Talvez" },
];
export function adminRsvpStatus(record?: RsvpRecord): AdminRsvpStatus {
  return record?.status === "PENDING" && record.responded_at
    ? "MAYBE"
    : record?.status || "PENDING";
}
export const invitationSendingHint = (sent: boolean) =>
  sent
    ? "Convite enviado — clique para marcar como não enviado."
    : "Convite não enviado — clique para marcar como enviado.";
