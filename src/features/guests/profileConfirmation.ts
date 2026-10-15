import { z } from "zod";
import type { Snapshot } from "../../types/domain";
import { normalizePhone } from "../../utils/security";
export const confirmationTitle = "💙 Antes de continuar, confirme seus dados!";
export const confirmationName = (value: string) =>
  value.normalize("NFC").replace(/\s+/gu, " ").trim();
export const profileConfirmationSchema = z.object({
  name: z
    .string()
    .transform(confirmationName)
    .pipe(
      z
        .string()
        .min(1, "Informe seu nome completo.")
        .max(200, "Use até 200 caracteres.")
        .refine(
          (v) =>
            !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(
              v,
            ),
          "Confira os caracteres do nome.",
        ),
    ),
  whatsapp: z
    .string()
    .regex(/^[+0-9 ()-]+$/, "Informe um WhatsApp válido com DDD.")
    .transform(normalizePhone)
    .pipe(
      z
        .string()
        .regex(
          /^(55)?[1-9][1-9]9[0-9]{8}$/,
          "Informe um celular com DDD e 11 dígitos.",
        ),
    ),
  email: z
    .string()
    .trim()
    .min(1, "Informe seu e-mail.")
    .max(320, "Use até 320 caracteres.")
    .email("Informe um e-mail válido.")
    .refine(
      (v) =>
        v.split("@").length === 2 &&
        v.split("@")[0]!.length <= 64 &&
        v.split("@")[1]!.length <= 253,
      "Informe um e-mail válido.",
    ),
});
export function confirmationMembers(snapshot: Snapshot | null) {
  const unit =
    snapshot?.current_invitation_id ||
    (snapshot?.invitations.length === 1 ? snapshot.invitations[0]?.id : null);
  if (snapshot?.role !== "GUEST" || !unit) return [];
  return snapshot.guests.filter(
    (g) => g.invitation_id === unit && g.event_id === snapshot.event.id,
  );
}
export function profileConfirmationPending(snapshot: Snapshot | null) {
  if (snapshot?.role !== "GUEST" || !snapshot.profile_confirmation?.supported)
    return false;
  const selected = confirmationMembers(snapshot).find(
    (g) => g.id === snapshot.profile_confirmation?.guest_id,
  );
  return !selected || !selected.profile_confirmed_at;
}
