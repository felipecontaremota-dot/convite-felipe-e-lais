import type { Snapshot } from "../../types/domain";
export function lastInvitationDelivery(
  deliveries: Snapshot["invitation_deliveries"],
  guest: string,
  invitation: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  return (deliveries || [])
    .filter(
      (d) =>
        d.status === "sent" &&
        d.sent_at &&
        (d.guest_id === guest ||
          (normalized &&
            d.invitation_id === invitation &&
            d.recipient_email === normalized)),
    )
    .sort(
      (a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime(),
    )[0];
}

export interface InvitationSendResult {
  message: string;
  complete: boolean;
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
}
export async function retainedInvitationRequest(
  requests: Map<string, string>,
  key: string,
  makeId: () => string,
  send: (request: string) => Promise<InvitationSendResult>,
) {
  const request = requests.get(key) || makeId();
  requests.set(key, request);
  const result = await send(request);
  if (result.complete && result.pending === 0) requests.delete(key);
  return result;
}
