import type { Checkin, Credential } from "../../types/domain";
export function validateCredential(
  hash: string,
  credentials: Credential[],
  checkins: Checkin[],
) {
  const credential = credentials.find(
    (c) => c.token_hash === hash && !c.revoked_at,
  );
  if (!credential) return { status: "invalid" as const };
  const checkin = checkins.find((c) => c.guest_id === credential.guest_id);
  return checkin
    ? { status: "used" as const, credential, checkin }
    : { status: "valid" as const, credential };
}
export function uniqueCheckin(existing: Checkin[], next: Checkin) {
  const found = existing.find(
    (c) =>
      (c.guest_id === next.guest_id && c.event_id === next.event_id) ||
      c.mutation_id === next.mutation_id,
  );
  return { checkin: found || next, duplicate: !!found };
}
