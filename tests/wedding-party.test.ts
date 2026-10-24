import { envelopeSequence } from "../src/features/weddingParty/envelopeTimeline";
import {
  partyName,
  letterParagraphs,
  storyParagraphs,
} from "../src/features/weddingParty/letterContent";
import { partyNavigation } from "../src/lib/normalizeWebUrl";
import { describe, expect, it } from "vitest";
import { homeRsvpButton } from "../src/features/guests/homeContent";
import type { Guest, RsvpRecord } from "../src/types/domain";
const guests = [{ id: "a" }, { id: "b" }] as Guest[];
function records(status: string, answered = true) {
  return guests.map((g) => ({
    guest_id: g.id,
    status,
    responded_at: answered ? "2026-01-01" : null,
  })) as RsvpRecord[];
}
describe("Home RSVP presentation", () => {
  it("uses the button for confirmed, declined, pending, undecided and mixed units without changing records", () => {
    const confirmed = records("CONFIRMED");
    const before = JSON.stringify(confirmed);
    expect(homeRsvpButton(guests, confirmed)).toBe(
      "Sua presença está confirmada.",
    );
    expect(JSON.stringify(confirmed)).toBe(before);
    const mixed = [confirmed[0]!, records("DECLINED")[1]!];
    expect(homeRsvpButton(guests, mixed, [], "a")).toBe(
      "Sua presença está confirmada.",
    );
    expect(homeRsvpButton(guests, mixed, [], "b")).toBe(
      "Sua ausência foi confirmada, sentiremos sua falta.",
    );
    expect(homeRsvpButton(guests, records("DECLINED"))).toBe(
      "Sua ausência foi confirmada, sentiremos sua falta.",
    );
    for (const rows of [
      records("PENDING"),
      records("PENDING", false),
      [],
      [confirmed[0]!, records("PENDING")[1]!],
    ])
      expect(homeRsvpButton(guests, rows)).toBe(
        "Ainda dá tempo de você confirmar sua presença.",
      );
  });
});

it("retains only safe party navigation on reload, never credentials or arbitrary queries", () => {
  expect(
    partyNavigation(
      "/padrinhos",
      "?surpresa=1&pagina=dia&pin=1234&token=secret",
    ),
  ).toBe("surpresa=1&pagina=dia");
  expect(partyNavigation("/padrinhos", "?surpresa=other&pagina=unknown")).toBe(
    "",
  );
  expect(partyNavigation("/login", "?surpresa=1&pin=1234")).toBe("");
});

it("uses any optional treatment as text and falls back to the first registered name", () => {
  expect(partyName("João Pedro Silva")).toBe("João");
  expect(partyName("Maria Fernanda Oliveira")).toBe("Maria");
  expect(partyName("  Amanda   Silva ", "  Minha querida amiga  ")).toBe(
    "Minha querida amiga",
  );
  expect(partyName("Amanda Silva", "   ")).toBe("Amanda");
  expect(partyName("João Pedro Silva", null)).toBe("João");
  expect(partyName("João Pedro Silva", "<em>João</em>")).toBe("<em>João</em>");
  expect(partyName(" ")).toBe("Você");
});
it("preserves the entire story in order, personal paragraphs, safe text and gendered question", () => {
  const body = letterParagraphs(
    "Medina",
    "Primeiro parágrafo.\nCom linha.\n\nSegundo parágrafo.\n\n<script>alert(1)</script>",
    "MADRINHA",
  );
  expect(body.slice(0, 8).map((p) => p.before)).toEqual([...storyParagraphs]);
  expect(body[8]).toEqual({
    before: "Assim foi na vida dos dois quando você, ",
    name: "Medina",
    after: ", apareceu!",
  });
  expect(body.slice(9, 12).map((p) => p.before)).toEqual([
    "Primeiro parágrafo.\nCom linha.",
    "Segundo parágrafo.",
    "<script>alert(1)</script>",
  ]);
  expect(body.at(-1)).toEqual({
    before: "",
    name: "Medina",
    after: ", aceita ser nossa madrinha?",
  });
  expect(letterParagraphs("João", null, "PADRINHO").at(-1)?.after).toBe(
    ", aceita ser nosso padrinho?",
  );
});

it("waits for completed flap and extraction before light, never advancing on rerender or time alone", async () => {
  const calls: string[] = [];
  const pending: (() => void)[] = [];
  const running = envelopeSequence(
    (step) => {
      calls.push(step);
      return new Promise<void>((resolve) => pending.push(resolve));
    },
    (phase) => calls.push(`phase:${phase}`),
  );
  expect(calls).toEqual(["phase:seal", "seal"]);
  pending.shift()!();
  await Promise.resolve();
  expect(calls.slice(-2)).toEqual(["phase:opening", "flap"]);
  pending.shift()!();
  await Promise.resolve();
  expect(calls.slice(-2)).toEqual(["phase:open", "settle"]);
  pending.shift()!();
  await Promise.resolve();
  expect(calls.slice(-2)).toEqual(["phase:extracting", "letter"]);
  pending.shift()!();
  await Promise.resolve();
  expect(calls.slice(-3)).toEqual(["phase:revealed", "phase:flash", "light"]);
  pending.shift()!();
  await running;
});

it("corrects the original shared story without visually replacing rendered text", () => {
  expect(storyParagraphs[5]).toBe(
    'E é curioso como algumas pessoas aparecem nas vidas uma das outras. Em um primeiro momento parece ser sem motivo, parece que aquele contato vai ser passageiro. É só mais um "alguém" até deixar de ser.',
  );
});
