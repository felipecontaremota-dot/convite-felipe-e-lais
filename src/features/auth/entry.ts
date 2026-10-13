import { AppError } from "../../lib/errors";
import type { Snapshot } from "../../types/domain";
export const entryLoadMessage =
  "Seu acesso foi confirmado, mas não foi possível carregar o convite. Tente carregar novamente.";
export function validateEntrySnapshot(
  snapshot: Snapshot,
  event: string,
  expected?: string | null,
): Snapshot {
  const invitation = snapshot.current_invitation_id;
  if (
    snapshot.role !== "GUEST" ||
    snapshot.event?.id !== event ||
    !invitation ||
    (expected && invitation !== expected) ||
    snapshot.invitations.length !== 1 ||
    snapshot.invitations[0]?.id !== invitation ||
    snapshot.guests.some(
      (g) => g.invitation_id !== invitation || g.event_id !== event,
    )
  )
    throw new AppError(entryLoadMessage, "ENTRY_LOAD");
  return snapshot;
}
export async function loadEntrySnapshot(
  load: () => Promise<Snapshot>,
  event: string,
  expected?: string | null,
) {
  try {
    return validateEntrySnapshot(await load(), event, expected);
  } catch {
    throw new AppError(entryLoadMessage, "ENTRY_LOAD");
  }
}
