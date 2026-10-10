export const validMessageId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);

export async function dispatchCommittedMessage(
  result: { id?: unknown },
  channels: string[],
  dispatch: (channels: string[], message: string) => Promise<string>,
) {
  if (!validMessageId(result.id))
    return "Mensagem já registrada. O processamento pendente depende do scheduler; consulte o histórico.";
  return dispatch(channels, result.id);
}

export function effectiveRecipients(
  activePeople: { id: string; invitation_id: string }[],
  target: string,
  family: string,
  selected: string[],
) {
  return [
    ...new Set(
      activePeople
        .filter((g) =>
          target === "GUEST"
            ? selected.includes(g.id)
            : target === "FAMILY"
              ? g.invitation_id === family
              : target === "ALL",
        )
        .map((g) => g.id),
    ),
  ];
}

export function recipientError(target: string, count: number) {
  if (count > 500)
    return "Esta mensagem possui mais de 500 destinatários. Reduza a seleção antes de enviar.";
  if (count === 0)
    return target === "ALL"
      ? "Não há convidados ativos para receber esta mensagem."
      : target === "FAMILY"
        ? "Esta família não possui convidados ativos."
        : "Selecione pelo menos uma pessoa.";
  return null;
}
