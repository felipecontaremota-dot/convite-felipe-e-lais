import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/errors";
import { staffDestination } from "../../utils/security";
import type { Role } from "../../types/domain";
type Client = Pick<SupabaseClient, "auth" | "rpc">;
export class StaffValidationError extends AppError {
  constructor() {
    super(
      "Não foi possível validar seu acesso agora. Tente novamente.",
      "STAFF_VALIDATION",
    );
  }
}
export async function requireStaff(client: Client, event: string) {
  let result;
  try {
    result = await client.rpc("event_role", { p_event: event });
  } catch {
    throw new StaffValidationError();
  }
  if (result.error) throw new StaffValidationError();
  const role = result.data as Role | null;
  if (!staffDestination(role)) {
    await client.auth.signOut();
    throw new AppError(
      "Esta conta não tem acesso aos noivos ou ao cerimonial.",
    );
  }
  return role as "ADMIN" | "CEREMONIALIST";
}
export async function passwordLogin(
  client: Client,
  event: string,
  email: string,
  password: string,
) {
  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new AppError("E-mail ou senha inválidos.");
  return requireStaff(client, event);
}
export async function savePassword(
  client: Client,
  event: string,
  password: string,
  confirmation: string,
) {
  if (password.length < 8 || password !== confirmation)
    throw new AppError("Use pelo menos 8 caracteres e confirme a mesma senha.");
  await requireStaff(client, event);
  const { error } = await client.auth.updateUser({ password });
  if (error)
    throw new AppError(
      "Não foi possível alterar a senha. Entre novamente e tente outra vez.",
    );
}
