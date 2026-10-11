import type { InvitationSendResult } from "../features/guests/invitationDelivery";
import { validMessageId } from "../features/messages/recipients";
import { supabase, eventId } from "../lib/supabase";
import {
  administrativeError,
  AppError,
  AuthError,
  NetworkError,
} from "../lib/errors";
import type { OfflineMutation, Snapshot, Ticket } from "../types/domain";
import { invitationCode, invitationPin } from "../utils/security";
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase)
    throw new AppError(
      "O convite ainda não está disponível. Tente novamente mais tarde.",
    );
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("Network")
    )
      throw new NetworkError();
    throw new AppError(
      error.message.includes("unauthorized")
        ? "Acesso não autorizado."
        : error.message.includes("family access required")
          ? "Configure a senha e gere o link da família antes de adicionar membros."
          : error.message.includes("ticket_exists")
            ? "Já existe um ingresso. Escolha regenerar para substituir a versão anterior."
            : administrativeError(error.message) ||
              "Não foi possível concluir a operação.",
      error.code,
    );
  }
  return data as T;
}
export const getSnapshot = () =>
  rpc<Snapshot>("app_snapshot", { p_event: eventId });
export const mutate = (item: OfflineMutation) =>
  rpc("app_mutate", {
    p_event: eventId,
    p_mutation: item.mutationId,
    p_type: item.type,
    p_payload: item.payload,
  });
export const adminAction = (action: string, payload: Record<string, unknown>) =>
  rpc<Record<string, unknown>>("admin_action", {
    p_event: eventId,
    p_action: action,
    p_payload: payload,
  });
export const issueTicket = (guest: string, regenerate = false) =>
  rpc<Ticket>("issue_ticket", {
    p_event: eventId,
    p_guest: guest,
    p_regenerate: regenerate,
  });
export const accessMessages = {
  link: "Este link de convite é inválido ou não está mais ativo.",
  unavailable: "Este convite não está mais disponível.",
  password: "Senha inválida.",
  staff:
    "Você está conectado em uma conta administrativa. Saia dessa conta ou abra o convite em outro navegador/dispositivo.",
  identifyTechnical:
    "Não foi possível carregar o convite agora. Tente novamente.",
  redeemTechnical: "Não foi possível abrir o convite agora. Tente novamente.",
};
export async function invitationAccess(code: string, pin?: string) {
  const technical =
    pin === undefined
      ? accessMessages.identifyTechnical
      : accessMessages.redeemTechnical;
  if (!invitationCode.safeParse(code).success)
    throw new AuthError(
      pin === undefined ? accessMessages.link : accessMessages.unavailable,
    );
  if (pin !== undefined && !invitationPin.safeParse(pin).success)
    throw new AuthError(accessMessages.password);
  if (!supabase) throw new AppError(technical);
  try {
    const current = await supabase.auth.getSession();
    if (current.error) throw new AppError(technical);
    let session = current.data.session;
    if (!session) {
      const result = await supabase.auth.signInAnonymously();
      if (result.error || !result.data.session) throw new AppError(technical);
      session = result.data.session;
    }
    if (!session.user.is_anonymous) throw new AuthError(accessMessages.staff);
    const { data, error } = await supabase.functions.invoke(
      "redeem-invitation",
      {
        body: {
          code,
          event_id: eventId,
          ...(pin === undefined ? { action: "identify" } : { pin }),
        },
      },
    );
    if (error) {
      const response = "context" in error ? error.context : null;
      const body =
        response instanceof Response
          ? await response.json().catch(() => null)
          : null;
      if (body?.code === "invalid_link")
        throw new AuthError(
          pin === undefined ? accessMessages.link : accessMessages.unavailable,
        );
      if (body?.code === "invalid_password")
        throw new AuthError(accessMessages.password);
      if (body?.code === "staff_session")
        throw new AuthError(accessMessages.staff);
      throw new AppError(technical);
    }
    return data as { name: string; activated: boolean };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(technical);
  }
}
export const identifyInvitation = (code: string) => invitationAccess(code);
export const redeem = (code: string, pin: string) =>
  invitationAccess(code, pin);

export interface DispatchResult {
  sent: number;
  skipped: number;
  failed: number;
  results: { channel: string; status: string; reason?: string }[];
}
export function messageDeliverySummary(
  channels: string[],
  result: DispatchResult,
): string {
  const email = result.results.filter((r) => r.channel === "EMAIL");
  if (channels.includes("EMAIL")) {
    if (!email.length)
      return "Mensagem registrada. O processamento do e-mail está pendente.";
    if (email.some((r) => r.status === "failed"))
      return "Mensagem registrada, mas houve falha no envio de e-mail.";
    const skipped = email.filter((r) => r.status === "skipped");
    if (skipped.length) {
      const reasons = skipped.map((r) => r.reason || "").join(" ");
      return reasons.includes("Consentimento")
        ? "Mensagem registrada, mas o e-mail não foi enviado a todos: o convidado não autorizou esse canal."
        : "Mensagem registrada, mas o serviço de e-mail ainda não está configurado.";
    }
    if (email.every((r) => r.status === "sent"))
      return "Mensagem registrada. E-mail enviado.";
    return "Mensagem registrada. O processamento do e-mail está pendente.";
  }
  if (channels.includes("IN_APP")) {
    const inbox = result.results.filter((r) => r.channel === "IN_APP");
    if (inbox.length && inbox.every((r) => r.status === "sent"))
      return "Mensagem enviada no aplicativo.";
    return "Mensagem registrada. A entrega no aplicativo está pendente ou não foi autorizada.";
  }
  return "Mensagem registrada. Consulte o resultado dos canais externos.";
}
export async function dispatchMessage(channels: string[], message: string) {
  if (!validMessageId(message))
    throw new AppError("Não foi possível identificar a mensagem para envio.");
  if (!supabase)
    throw new AppError(
      "Mensagem registrada, mas o serviço de envio está indisponível.",
    );
  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-notifications",
      {
        body: {
          event_id: eventId,
          message_id: message,
        },
      },
    );
    if (error || !Array.isArray(data?.results))
      return "Mensagem registrada, mas o serviço de envio está indisponível ou ainda não foi publicado.";
    return messageDeliverySummary(channels, data as DispatchResult);
  } catch {
    return "Mensagem registrada, mas não foi possível confirmar o processamento dos envios. Tente novamente pelo histórico.";
  }
}
export async function sendInvitations(
  request: string,
  guest?: string,
  supersedes?: string,
): Promise<InvitationSendResult> {
  if (!supabase)
    throw new AppError("O serviço de envio de convites está indisponível.");
  const { data, error } = await supabase.functions.invoke("send-invitations", {
    body: {
      event_id: eventId,
      request_id: request,
      ...(guest ? { guest_id: guest } : {}),
      ...(supersedes ? { supersedes_request_id: supersedes } : {}),
    },
  });
  if (error)
    throw new AppError(
      "Não foi possível confirmar o envio. Tente novamente; a mesma operação será retomada sem duplicar e-mails.",
    );
  if (
    !Array.isArray(data?.results) ||
    ![data.pending, data.sent, data.skipped, data.failed].every(
      (n) => Number.isInteger(n) && n >= 0,
    )
  )
    throw new AppError(
      "Não foi possível confirmar o resultado do envio. Tente novamente com a mesma operação.",
    );
  let message: string;
  if (data.pending) {
    const reasons = data.results
      .filter((r: { status: string }) => r.status === "pending")
      .map((r: { reason?: string }) => r.reason);
    message = reasons.includes("payload_changed")
      ? "Os dados do convite mudaram desde a tentativa anterior. O resultado do envio anterior precisa ser confirmado antes de reenviar."
      : reasons.includes("expired")
        ? "O resultado deste envio não pôde ser confirmado. Verifique o histórico antes de iniciar um novo envio."
        : reasons.every((r: unknown) => r === "processing")
          ? "O envio ainda está sendo processado."
          : "Não foi possível confirmar o resultado do envio. O sistema manterá esta operação para verificação sem reenviar um convite duplicado.";
  } else if (guest && data.results[0]?.reason)
    message = `Convite não enviado: ${data.results[0].reason}.`;
  else
    message = `${data.sent} convite(s) confirmado(s), ${data.skipped} não enviado(s), ${data.failed} falha(s).`;
  return {
    message,
    complete: data.pending === 0,
    pending: data.pending,
    sent: data.sent,
    skipped: data.skipped,
    failed: data.failed,
  };
}
