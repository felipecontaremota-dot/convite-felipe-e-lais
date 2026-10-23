import type { MutationType } from "../types/domain";
export function mutationAction(type: MutationType) {
  const labels: Record<MutationType, string> = {
    MESSAGE_REPLY: "Falha ao enviar resposta.",
    MESSAGE_READ: "Falha ao registrar leitura.",
    MESSAGE_SEND: "Falha ao enviar mensagem.",
    MESSAGE_SEND_TO_GUESTS: "Falha ao enviar mensagem.",
    RSVP_UPDATE: "Falha ao atualizar presença.",
    CONTACT_UPDATE: "Falha ao atualizar contato.",
    CHECKIN_CREATE: "Falha ao registrar check-in.",
    CHECKIN_REVERT: "Falha ao remover registro de entrada.",
    GIFT_SELECT: "Falha ao atualizar presente.",
    PUSH_REGISTER: "Falha ao registrar dispositivo.",
  };
  return labels[type] || "Falha ao sincronizar alteração.";
}
