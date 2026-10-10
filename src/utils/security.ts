import { z } from "zod";
import type { Role } from "../types/domain";
export const invitationCode = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,64}$/, "Link de convite inválido.");
export const contactSchema = z.object({
  email: z.union([z.string().email(), z.literal("")]),
  whatsapp: z.string().regex(/^(\+?[0-9 ()-]{8,20})?$/, "WhatsApp inválido."),
  consent_in_app: z.boolean(),
  consent_push: z.boolean(),
  consent_email: z.boolean(),
  consent_whatsapp: z.boolean(),
});
export const rsvpSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "DECLINED"]),
  dietary: z.string().max(500),
  note: z.string().max(1000),
});
export function canAccess(
  role: Role | null,
  section: "guest" | "admin" | "ceremonial",
) {
  return section === "guest"
    ? role === "GUEST"
    : section === "admin"
      ? role === "ADMIN"
      : role === "ADMIN" || role === "CEREMONIALIST";
}
export function safeHttps(value: string | null | undefined): string | null {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export function invitationLink(base: string, code: string) {
  invitationCode.parse(code);
  const url = safeHttps(base);
  if (!url) throw new Error("Configure uma URL HTTPS.");
  return `${url.replace(/\/$/, "")}/c/${code}`;
}
export function codeFromLink(value: string) {
  try {
    const u = new URL(value);
    if (!["https:", "felipeelais:"].includes(u.protocol)) return null;
    const path =
      u.protocol === "felipeelais:" ? `/${u.host}${u.pathname}` : u.pathname;
    return invitationCode.parse(
      path.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)$/)?.[1],
    );
  } catch {
    return null;
  }
}
export function ticketToken(value: string) {
  const token = value.startsWith("wedding://ticket/") ? value.slice(17) : value;
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export const invitationPin = z
  .string()
  .regex(/^[0-9]{4}$/, "A senha deve ter 4 dígitos.");
export function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, "");
}
export function suggestedPin(phone: string) {
  const digits = normalizePhone(phone);
  return digits.length >= 8 ? digits.slice(-4) : null;
}
export function staffDestination(role: Role | null) {
  return role === "ADMIN"
    ? "/painel"
    : role === "CEREMONIALIST"
      ? "/checkin"
      : null;
}
