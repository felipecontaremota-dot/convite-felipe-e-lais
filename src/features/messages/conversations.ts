import type {
  Message,
  Snapshot,
  DeliveryJob,
  NotificationSchedule,
} from "../../types/domain";
export function chronological(messages: Message[]) {
  return [
    ...new Map(
      messages.filter((m) => !m.deleted_at).map((m) => [m.id, m]),
    ).values(),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id.localeCompare(b.id),
  );
}
export function category(m: Message): "general" | "private" {
  return m.audience === "GENERAL" ? "general" : "private";
}
export function isUnread(m: Message, data: Snapshot) {
  if (
    m.deleted_at ||
    m.from_admin === (data.role === "ADMIN") ||
    (data.role === "ADMIN" && !!m.legacy_admin_read_at)
  )
    return false;
  return data.capabilities?.messaging_v2
    ? !m.viewer_read_at
    : data.role === "ADMIN" && !m.read_at;
}
export function unreadMessages(
  data: Snapshot | null,
  tab?: "general" | "private",
) {
  return data
    ? chronological(data.messages).filter(
        (m) => isUnread(m, data) && (!tab || category(m) === tab),
      ).length
    : 0;
}
export function unitMessages(data: Snapshot, invitation: string) {
  const ids = new Set(
    data.guests.filter((g) => g.invitation_id === invitation).map((g) => g.id),
  );
  return chronological(data.messages).filter(
    (m) =>
      category(m) !== "general" &&
      (m.invitation_id === invitation ||
        (!m.invitation_id &&
          !!m.recipient_guest_ids?.some((id) => ids.has(id)))),
  );
}
export function scheduleState(s: NotificationSchedule, jobs: DeliveryJob[]) {
  if (s.status !== "dispatched")
    return s.status === "cancelled"
      ? "Cancelada"
      : s.active
        ? "Agendada"
        : "Pausada";
  const deliveries = jobs.filter((j) => j.message_id === s.id);
  if (!deliveries.length) return "Sem destinatários ativos";
  if (deliveries.some((j) => j.status === "processing"))
    return "Em processamento";
  if (deliveries.some((j) => j.status === "pending"))
    return "Aguardando entrega";
  if (deliveries.every((j) => j.status === "sent")) return "Enviada";
  if (deliveries.some((j) => j.status === "sent"))
    return "Parcialmente entregue";
  if (deliveries.some((j) => j.status === "uncertain"))
    return "Resultado não confirmado";
  if (deliveries.some((j) => j.status === "failed")) return "Falha de entrega";
  return "Não enviada — consentimento ou disponibilidade";
}
