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
