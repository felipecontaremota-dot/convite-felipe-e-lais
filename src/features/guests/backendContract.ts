import { AppError } from "../../lib/errors";
import type { Snapshot } from "../../types/domain";
export const guestSchemaMessage =
  "O serviço de convidados precisa ser atualizado. Peça à administração para conferir as migrations 007 e 008 no Supabase.";
export function requireGuestBackend(snapshot: Snapshot | null | undefined) {
  if (
    !snapshot ||
    !Object.prototype.hasOwnProperty.call(snapshot, "current_guest_id") ||
    !Array.isArray(snapshot.family_credentials)
  )
    throw new AppError(guestSchemaMessage, "SCHEMA");
}
export function hasTicketContract(snapshot: Snapshot | null | undefined) {
  return (
    (snapshot?.guest_access_version || 0) >= 8 &&
    Array.isArray(snapshot?.ticket_guest_ids) &&
    Array.isArray(snapshot?.family_ticket_invitation_ids)
  );
}
