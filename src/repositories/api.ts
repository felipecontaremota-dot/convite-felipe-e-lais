import { supabase, eventId } from "../lib/supabase";
import { AppError, AuthError, NetworkError } from "../lib/errors";
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
            : error.message.includes("conflict")
              ? "Dados alterados por outro usuário. Atualize a tela."
              : "Não foi possível concluir a operação.",
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
export async function invitationAccess(code: string, pin?: string) {
  if (
    !invitationCode.safeParse(code).success ||
    (pin !== undefined && !invitationPin.safeParse(pin).success)
  )
    throw new AuthError("Código ou senha inválido.");
  if (!supabase)
    throw new AppError(
      "O convite ainda não está disponível. Tente novamente mais tarde.",
    );
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw new AuthError("Não foi possível iniciar o acesso.");
    session = result.data.session;
  }
  if (!session?.user.is_anonymous)
    throw new AuthError("Saia da conta administrativa para ativar um convite.");
  const { data, error } = await supabase.functions.invoke("redeem-invitation", {
    body: {
      code,
      event_id: eventId,
      ...(pin === undefined ? { action: "identify" } : { pin }),
    },
  });
  if (error) throw new AuthError("Código ou senha inválido.");
  return data as { name: string; activated: boolean };
}
export const identifyInvitation = (code: string) => invitationAccess(code);
export const redeem = (code: string, pin: string) =>
  invitationAccess(code, pin);
