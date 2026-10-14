import type { OfflineMutation, RsvpRecord, RSVP } from "../../types/domain";

export const presenceChoices: { value: RSVP; label: string }[] = [
  { value: "CONFIRMED", label: "Já tô com a roupa de ir!!!" },
  { value: "DECLINED", label: "Vou deixar meu lugar pra outro sortudo!" },
  { value: "PENDING", label: "Vou ver e te aviso..." },
];
export const confirmationLabels: Record<RSVP, string> = {
  CONFIRMED: "Pode reservar meu lugar! 🎉",
  DECLINED: "Pode passar minha vez! 💔",
  PENDING: "Deixa eu fazer um suspense... 🕓",
};
export const responseContent: Record<RSVP, { title: string; message: string }> =
  {
    CONFIRMED: {
      title: "Aeeee! 🎉",
      message:
        "Agora sim, a festa tá ficando completa! Já estamos contando com você pra celebrar, se divertir e fazer parte desse dia inesquecível. Só não vale furar, hein?! ❤️",
    },
    DECLINED: {
      title: "Ahhh, que pena! 🥹💔",
      message:
        "Queríamos muito você com a gente! Mas tudo bem... vamos tentar nos divertir mesmo com essa ausência ilustre! ❤️",
    },
    PENDING: {
      title: "Opa, temos um suspense no ar! 👀",
      message:
        "Mas não demora muito pra decidir, hein?! A gente tá torcendo pra você dizer SIM! ❤️🎉",
    },
  };
export const responseMessages: Record<RSVP, string> = {
  CONFIRMED: `${responseContent.CONFIRMED.title} ${responseContent.CONFIRMED.message}`,
  DECLINED: `${responseContent.DECLINED.title} ${responseContent.DECLINED.message}`,
  PENDING: `${responseContent.PENDING.title} ${responseContent.PENDING.message}`,
};

// The queue proves a local response; only the server supplies responded_at.
export function effectiveResponse(
  guestId: string,
  record: RsvpRecord | undefined,
  pending: OfflineMutation[],
) {
  const queued = [...pending]
    .reverse()
    .find(
      (item) =>
        item.type === "RSVP_UPDATE" && item.payload.guest_id === guestId,
    );
  return {
    status: (queued?.payload.status ?? record?.status ?? "PENDING") as RSVP,
    dietary: String(queued?.payload.dietary ?? record?.dietary ?? ""),
    note: String(queued?.payload.note ?? record?.note ?? ""),
    answered:
      !!queued ||
      !!record?.responded_at ||
      record?.status === "CONFIRMED" ||
      record?.status === "DECLINED",
  };
}
