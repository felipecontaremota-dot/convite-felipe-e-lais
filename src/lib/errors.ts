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
