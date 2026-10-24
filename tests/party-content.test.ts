import {
  PartyContent,
  emptyCouplesNote,
} from "../src/features/weddingParty/PartyContent";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  ceremonyCopy,
  partyMapLink,
  openPartyMap,
} from "../src/features/weddingParty/content";
import type { PartyRole } from "../src/features/weddingParty/types";
import type { WeddingEvent } from "../src/types/domain";
vi.mock("react-native", () => ({
  Text: ({ children }: { children?: ReactNode }) =>
    createElement("p", null, children),
}));
vi.mock("../src/features/location/VenueLogo", () => ({
  VenueLogo: () => createElement("img", { alt: "Shared venue logo" }),
}));

vi.mock("../src/features/weddingParty/PartyVenueAddress", () => ({
  PartyVenueAddress: ({ event }: { event?: WeddingEvent }) =>
    createElement(
      "p",
      null,
      event?.address ||
        "O endereço será informado aqui quando estiver confirmado.",
    ),
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

it.each([
  ["PADRINHO", "recebê-lo", "conduzi-lo", "escolhido"],
  ["MADRINHA", "recebê-la", "conduzi-la", "escolhida"],
] as const)(
  "uses only the promotion role %s",
  (role, receive, lead, chosen) => {
    const copy = ceremonyCopy(role);
    expect(copy.guidance).toBe(
      `Ao chegar, procure nossa equipe de cerimonial, liderada pelo Gustavo Morais, que estará à disposição para ${receive} e ${lead}.`,
    );
    expect(copy.closing).toBe(
      `Acima de tudo, queremos que aproveite cada instante! Você foi ${chosen} porque faz parte da nossa história, e ter você pertinho de nós tornará esse momento ainda mais inesquecível! 💙`,
    );
  },
);
it.each([null, undefined, "UNKNOWN", "__proto__"])(
  "uses neutral wording for %s",
  (role) => {
    const copy = ceremonyCopy(role as PartyRole | null | undefined);
    expect(copy.guidance).toContain("receber você e conduzir você");
    expect(copy.closing).toContain("Você faz parte da nossa história");
    expect(JSON.stringify(copy)).not.toMatch(
      /escolhid[oa]|recebê-l[oa]|conduzi-l[oa]/,
    );
  },
);
const mapEvent = {
  address: "Endereço cadastrado",
  latitude: -16,
  longitude: -49,
  gps_url: "https://maps.app.goo.gl/official",
} as WeddingEvent;
it("prioritizes the configured precise HTTPS destination without altering event data", () => {
  const before = JSON.stringify(mapEvent);
  for (const apple of [false, true])
    expect(partyMapLink(mapEvent, apple)).toBe(mapEvent.gps_url);
  expect(JSON.stringify(mapEvent)).toBe(before);
});
it("uses valid stored coordinates, Apple Maps or Google Maps when no GPS is configured", () => {
  const event = { ...mapEvent, gps_url: null };
  expect(partyMapLink(event, true)).toBe(
    "https://maps.apple.com/?daddr=-16%2C-49",
  );
  expect(partyMapLink(event, false)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=-16%2C-49",
  );
  const addressOnly = { ...event, latitude: null, longitude: null };
  expect(decodeURIComponent(partyMapLink(addressOnly, true)!)).toContain(
    event.address!,
  );
});
it("rejects unsafe GPS and invalid coordinates, without fabricating a destination", () => {
  const event = {
    ...mapEvent,
    gps_url: "javascript:alert(1)",
    latitude: 91,
    longitude: 181,
  };
  expect(decodeURIComponent(partyMapLink(event)!)).toContain(event.address!);
  expect(partyMapLink({ ...event, address: null })).toBeNull();
});
it("delegates native Android once and falls back to HTTPS if no handler exists", async () => {
  const event = { ...mapEvent, gps_url: null };
  const open = vi
    .fn()
    .mockRejectedValueOnce(Error("no maps app"))
    .mockResolvedValue(undefined);
  expect(await openPartyMap(event, "android", open)).toBe(true);
  expect(open.mock.calls.map((c) => c[0])).toEqual([
    "geo:0,0?q=-16%2C-49",
    partyMapLink(event),
  ]);
});
it("opens the official destination without app inspection on every platform", async () => {
  for (const os of ["android", "ios", "web"]) {
    const open = vi.fn().mockResolvedValue(undefined);
    await openPartyMap(mapEvent, os, open);
    expect(open).toHaveBeenCalledExactlyOnceWith(mapEvent.gps_url);
  }
});
