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

it("uses the first name and restricts the Medina treatment to the exact configured full name", () => {
  expect(partyName("João Pedro Silva")).toBe("João");
  expect(partyName("Maria Fernanda Oliveira")).toBe("Maria");
  expect(
    partyName(
      " Amanda   Curcio Cariolano Romão Medina ".normalize("NFD"),
      "Medina",
    ),
  ).toBe("Medina");
  expect(partyName("Amanda Outra Pessoa")).toBe("Amanda");
  expect(partyName("Amanda Curcio Cariolano Romão")).toBe("Amanda");
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
