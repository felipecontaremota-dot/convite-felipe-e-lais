import type { Contact } from "../../types/domain";
import { normalizePhone } from "../../utils/security";

// Editing is limited to a Brazilian mobile number. Stored +55 legacy numbers
// retain their country code unless the user actually edits the field.
export function profilePhone(value: string) {
  let digits = normalizePhone(value);
  if ([12, 13].includes(digits.length) && digits.startsWith("55"))
    digits = digits.slice(2);
  return digits.slice(0, 11);
}
export function formatProfilePhone(value: string) {
  const p = profilePhone(value);
  if (!p) return "";
  if (p.length <= 2) return `(${p}`;
  const tail = p.slice(2);
  return `(${p.slice(0, 2)}) ${tail[0]}${tail.length > 1 ? " " + tail.slice(1, 5) : ""}${tail.length > 5 ? "-" + tail.slice(5) : ""}`;
}

export function profileSaveFeedback(result: string) {
  return result === "Sincronizado com sucesso." ? "Salvo com sucesso." : result;
}

export function revocation(contact: Omit<Contact, "guest_id">) {
  return contact.communications_revoked ?? false;
}
export function withRevocation<T extends Omit<Contact, "guest_id">>(
  contact: T,
  revoked: boolean,
): T {
  return { ...contact, communications_revoked: revoked };
}
