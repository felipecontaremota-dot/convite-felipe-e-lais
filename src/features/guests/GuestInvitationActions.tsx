import { useFxToast } from "../../components/FxToastProvider";
import { ActionFeedbackButton } from "../../components/ActionFeedbackButton";
import { useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import { copyText } from "../../utils/externalLinks";
import { resolveAccessLink } from "../invitations/AccessControls";
import { invitationActionOutcome } from "./invitationActionOutcome";
import type { InvitationSendResult } from "./invitationDelivery";
import type { Guest } from "../../types/domain";
import type { useInvitationDelivery } from "./useInvitationDelivery";

export function GuestInvitationActions({
  guest: g,
  delivery,
  feedback: externalFeedback,
}: {
  guest: Guest;
  delivery: ReturnType<typeof useInvitationDelivery>;
  feedback?: ReturnType<typeof useFeedback>;
}) {
  const { notify } = useFxToast();
  const app = useApp(),
    localFeedback = useFeedback(),
    feedback = externalFeedback || localFeedback;
  const data = app.data,
    unit = data?.invitations.find((i) => i.id === g.invitation_id);
  const { requests, deliver } = delivery;
  if (data?.role !== "ADMIN") return null;
  return (
    <>
      <ActionFeedbackButton
        onStart={feedback.clear}
        icon="copy"
        label={`Copiar link do convite de ${g.name}`}
        action={async () => {
          if (!unit) throw new AppError("Link indisponível.");
          await copyText(await resolveAccessLink(unit, app.scope));
          return { message: "Link copiado", confirmed: true };
        }}
        onError={(error) =>
          void feedback.run(async () => {
            throw error;
          })
        }
      />
      <ActionFeedbackButton
        onStart={feedback.clear}
        icon="send"
        label={`Enviar convite para ${g.name}`}
        action={async () => {
          if (
            !requests.current.has(g.id) &&
            !data?.contacts.find((c) => c.guest_id === g.id)?.email.trim()
          )
            throw new AppError("Este convidado não possui e-mail cadastrado.");
          const response: { value?: InvitationSendResult } = {};
          const message = await deliver(g.id, (result) => {
            response.value = result;
          });
          const outcome = response.value
            ? invitationActionOutcome(response.value)
            : {
                message: "Envio não iniciado",
                confirmed: false,
                detail: message,
              };
          // A successful send may remove this row from an unsent-only modal.
          // Keep its confirmation visible through the shared, persistent toast.
          if (!externalFeedback && outcome.confirmed) notify(outcome.message);
          return outcome;
        }}
        onNotice={(message) => void feedback.run(async () => message)}
        onError={(error) =>
          void feedback.run(async () => {
            throw error;
          })
        }
      />
      {!externalFeedback ? feedback.node : null}
    </>
  );
}
