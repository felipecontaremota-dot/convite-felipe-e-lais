import type { PartyRole } from "./types";
// The server supplies an explicit treatment only for the configured individual.
export function partyName(fullName: string, treatment?: string | null) {
  const canonical = fullName.normalize("NFC").trim().replace(/\s+/g, " ");
  return treatment || canonical.split(" ")[0] || "";
}
export const storyParagraphs = [
  "Nós, Felipe e Laís, nos conhecemos quase que por acaso.",
  'É aquela coisa de estar no local certo, na hora certa. É aquele "oi" despretensioso, dito uma vez para nunca mais ser repetido, mas que acaba fazendo parte da rotina indispensável de cada um.',
  "É aquela surpresa que você não espera quando acorda pela manhã.",
  "É a mudança na sua vida que você não planejava.",
  "É a decisão tomada inconscientemente. É onde a emoção substitui a razão, você querendo ou não.",
  'E é curioso como algumas pessoas aparecem nas vidas uma das outras. Em um primeiro momento pare ser sem motivo, parece que aquele contato vai ser passageiro. É só mais um "alguém" até deixar de ser.',
  "Contudo, o tempo, senhor da razão, nos mostra que essas pessoas têm importância para nossas vidas. Elas possuem significados indescritíveis. Não há como adjetivá-las. Faltam palavras para descrever quão especial são. Cada uma, do seu modo, no seu devido momento, se revela digna de fazer parte da nossa história.",
  "Assim foi na vida da Laís, quando o Felipe apareceu. Assim foi na vida do Felipe, quando a Laís apareceu.",
] as const;
export interface LetterParagraph {
  before: string;
  name?: string;
  after?: string;
}
export function letterParagraphs(
  name: string,
  message: string | null | undefined,
  role: PartyRole,
): LetterParagraph[] {
  return [
    ...storyParagraphs.map((before) => ({ before })),
    {
      before: "Assim foi na vida dos dois quando você, ",
      name,
      after: ", apareceu!",
    },
    ...(message
      ? message.split(/\r?\n[ \t]*\r?\n/).map((before) => ({ before }))
      : []),
    { before: "E é por isso que temos um pedido do coração para você!" },
    {
      before: "",
      name,
      after:
        role === "MADRINHA"
          ? ", aceita ser nossa madrinha?"
          : ", aceita ser nosso padrinho?",
    },
  ];
}
export const ENVELOPE_DURATION = 5200;
