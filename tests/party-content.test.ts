import {
  PartyContent,
  emptyCouplesNote,
} from "../src/features/weddingParty/PartyContent";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { WeddingEvent } from "../src/types/domain";
vi.mock("react-native", () => ({
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("p", null, children),
}));
vi.mock("../src/features/location/VenueLogo", () => ({
  VenueLogo: () => createElement("img", { alt: "Shared venue logo" }),
}));

const render = (page: string, note?: string | null, event?: WeddingEvent) =>
  renderToStaticMarkup(createElement(PartyContent, { page, note, event }));
it("renders only the supplied note, preserves paragraphs and escapes HTML", () => {
  const note = "Querida amiga 💙\n\n<script>alert(1)</script> & carinho";
  const html = render("recado", note);
  expect(html).toContain("Querida amiga 💙\n\n&lt;script&gt;");
  expect(html).toContain("&amp; carinho");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain(emptyCouplesNote);
});
it.each([null, undefined, "", "  \n\t"])(
  "shows a discreet empty state for %s without technical values",
  (note) => {
    const html = render("recado", note);
    expect(html).toContain(emptyCouplesNote);
    expect(html).not.toMatch(/null|undefined/);
  },
);
it("uses the shared venue component and the configured event address", () => {
  const html = render("dia", null, {
    address: "Endereço do evento & detalhes",
  } as WeddingEvent);
  expect(html).toContain("Falta pouco para você estar conosco no Villarejo.");
  expect(html).toContain("Shared venue logo");
  expect(html).toContain("Endereço do evento &amp; detalhes");
  expect(html).not.toContain("O grande dia");
});
it("retains approved attire and ceremony guidance without invented schedule", () => {
  const attire = render("traje");
  for (const phrase of [
    "O azul simboliza confiança",
    "Madrinhas:",
    "azul serenity ou azul-claro",
    "Padrinhos:",
    "azul-marinho",
    "preferencialmente marrons ou pretos",
    "confortáveis para aproveitar cada instante",
    "ter vocês ao nosso lado! 💙",
  ])
    expect(attire).toContain(phrase);
  const ceremony = render("cerimonia");
  for (const phrase of [
    "🕊️ Chegada:",
    "30 minutos de antecedência ao horário da cerimônia",
    "💍 Cortejo:",
    "✨ Orientações:",
    "liderada pelo Gustavo Morais",
    "inesquecível! 💙",
  ])
    expect(ceremony).toContain(phrase);
  expect(ceremony).not.toMatch(/\d{1,2}:\d{2}/);
});
