import type { InvitationSendResult } from "./invitationDelivery";
import type { ActionOutcome } from "../../components/ActionFeedbackButton";
import { AppError } from "../../lib/errors";
// `sent` confirms provider acceptance, not inbox delivery. Pending/demo/skipped
// results never receive the success checkmark.
export function invitationActionOutcome(
  result: InvitationSendResult,
): ActionOutcome {
  if (result.failed) throw new AppError(result.message);
  if (
    result.complete &&
    result.pending === 0 &&
    result.sent > 0 &&
    result.skipped === 0
  )
    return { message: "E-mail enviado", confirmed: true };
  return {
    message: result.pending ? "Envio pendente" : "Envio não realizado",
    confirmed: false,
    detail: result.message,
  };
}
