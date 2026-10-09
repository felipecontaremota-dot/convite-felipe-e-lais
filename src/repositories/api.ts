import { supabase, eventId } from "../lib/supabase";
import { AppError, AuthError, NetworkError } from "../lib/errors";
import type { OfflineMutation, Snapshot, Ticket } from "../types/domain";
import { invitationCode } from "../utils/security";
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase)
    throw new AppError("Configure o Supabase para conectar o convite.");
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
export const issueTicket = (guest: string) =>
  rpc<Ticket>("issue_ticket", { p_event: eventId, p_guest: guest });
export async function redeem(code: string) {
  invitationCode.parse(code);
  if (!supabase)
    throw new AppError(
      "Configure o Supabase ou use o modo demo de desenvolvimento.",
    );
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw new AuthError("Não foi possível iniciar o acesso.");
    session = result.data.session;
  }
  const { error } = await supabase.functions.invoke("redeem-invitation", {
    body: { code, event_id: eventId },
  });
  if (error)
    throw new AuthError(
      "Convite inválido, bloqueado ou limite de tentativas atingido.",
    );
  return session;
}
