import type { Contact } from "../../types/domain";

// Keep a persisted or queued global opt-out through stale forms and optimistic updates.
export function preserveContactRevocation(
  current: Contact | undefined,
  update: Contact,
): Contact {
  const contact = { ...current, ...update };
  if (current?.notifications_revoked || update.notifications_revoked) {
    return {
      ...contact,
      notifications_revoked: true,
      consent_in_app: false,
      consent_push: false,
      consent_email: false,
      consent_whatsapp: false,
    };
  }
  return contact;
}
