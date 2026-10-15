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
  return deliveryState(deliveries);
}
export function deliveryState(deliveries: DeliveryJob[]) {
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

export function messageDate(value: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}:${get("minute")}`;
}
export function senderCaption(message: Message) {
  if (!message.from_admin) return null;
  if (message.audience === "GENERAL") return "Felipe & Laís para todos";
  if (message.audience === "FAMILY") return "Felipe & Laís para sua família";
  if (message.audience === "INDIVIDUAL" || message.audience === "PRIVATE")
    return "Felipe & Laís para você";
  return "Felipe & Laís";
}
export function conversationList(data: Snapshot) {
  return data.invitations
    .map((unit) => {
      const messages = unitMessages(data, unit.id);
      const latest = messages.at(-1);
      const anchor = [...messages]
        .reverse()
        .find((m) => !m.from_admin && m.invitation_id === unit.id);
      const unread = messages.filter((m) => isUnread(m, data)).length;
      return { unit, messages, latest, anchor, unread };
    })
    .filter(
      (c) =>
        !!c.latest ||
        (c.unit.active &&
          !c.unit.archived_at &&
          data.guests.some((g) => g.invitation_id === c.unit.id)),
    )
    .sort(
      (a, b) =>
        (b.latest ? new Date(b.latest.created_at).getTime() : 0) -
          (a.latest ? new Date(a.latest.created_at).getTime() : 0) ||
        a.unit.id.localeCompare(b.unit.id),
    );
}
