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
export const friendlyError = (error: unknown) =>
  error instanceof ZodError
    ? "Confira os campos informados e tente novamente."
    : error instanceof AppError
      ? error.message
      : "Não foi possível concluir. Verifique os dados e tente novamente.";
