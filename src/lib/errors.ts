import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public code = "APP",
  ) {
    super(message);
    this.name = "AppError";
  }
}
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION");
  }
}
export class AuthError extends AppError {
  constructor(message = "Acesso não autorizado.") {
    super(message, "AUTH");
  }
}
export class NetworkError extends AppError {
  constructor() {
    super("Sem conexão. Tente novamente.", "NETWORK");
  }
}
export class SyncError extends AppError {
  constructor(message: string) {
    super(message, "SYNC");
  }
}
export function administrativeError(message: string): string | null {
  if (message.includes("notification scheduling not enabled"))
    return "O agendamento ainda não foi ativado para este evento.";
  if (message.includes("content too long"))
    return "Reduza o texto para o limite seguro do canal selecionado.";
  if (message.includes("legacy announcement needs association"))
    return "Este recado histórico possui um destaque sem vínculo inequívoco. A exclusão foi bloqueada para preservar outras mensagens.";
  if (message.includes("schedule immutable"))
    return "Esta notificação já foi processada ou cancelada e não pode ser editada.";
  if (message.includes("delivery already admitted"))
    return "O envio já foi iniciado. Não é possível cancelar uma entrega em andamento.";
  if (message.includes("invalid future date"))
    return "Escolha uma data e um horário futuros.";
  if (message === "invitation password conflict")
    return "Esta senha já está em uso neste evento. Escolha outra senha.";
  if (message === "initial invitation password allocation exhausted")
    return "Não foi possível criar uma senha inicial disponível. A operação não foi concluída.";
  if (message.includes("conflict"))
    return "Os dados foram alterados em outra sessão. Atualize e tente novamente.";
  if (message.includes("not found"))
    return "O registro não existe mais. Atualize a página.";
  if (
    message.includes("invalid family") ||
    message.includes("invalid invitation")
  )
    return "A família selecionada não está mais disponível.";
  if (message.includes("invalid recipient"))
    return "Selecione pessoas disponíveis neste evento e tente novamente.";
  return null;
}
export const friendlyError = (error: unknown) =>
  error instanceof ZodError
    ? "Confira os campos informados e tente novamente."
    : error instanceof Error && administrativeError(error.message)
      ? administrativeError(error.message)!
      : error instanceof AppError
        ? error.message
        : "Não foi possível concluir. Verifique os dados e tente novamente.";
