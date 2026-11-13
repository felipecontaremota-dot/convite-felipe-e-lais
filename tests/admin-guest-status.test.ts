import { expect, it } from "vitest";
import { adminRsvpStatus } from "../src/features/guests/adminGuestStatus";
import { listGuests } from "../src/features/guests/adminDomain";
import type { RsvpRecord, Snapshot } from "../src/types/domain";
it("distinguishes an unanswered RSVP from an explicit maybe without changing the stored enum", () => {
  expect(
    adminRsvpStatus({ status: "PENDING", responded_at: null } as RsvpRecord),
  ).toBe("PENDING");
  expect(
    adminRsvpStatus({
      status: "PENDING",
      responded_at: "2026-10-21",
    } as RsvpRecord),
  ).toBe("MAYBE");
  expect(adminRsvpStatus(undefined)).toBe("PENDING");
});
it("filters individual sending and each of the four presence groups independently", () => {
  const s = {
    invitations: [{ id: "family", name: "Family", sent_at: "2026-01-01" }],
    guests: [
      { id: "a", name: "A", invitation_id: "family", invitation_sent: true },
      { id: "b", name: "B", invitation_id: "family", invitation_sent: false },
    ],
    rsvps: [
      { guest_id: "a", status: "PENDING", responded_at: null },
      { guest_id: "b", status: "PENDING", responded_at: "2026-10-21" },
    ],
  } as unknown as Snapshot;
  expect(listGuests(s, "", "PENDING").map((g) => g.id)).toEqual(["a"]);
  expect(listGuests(s, "", "MAYBE").map((g) => g.id)).toEqual(["b"]);
  expect(listGuests(s, "", "SENT").map((g) => g.id)).toEqual(["a"]);
  expect(listGuests(s, "", "UNSENT").map((g) => g.id)).toEqual(["b"]);
  expect(listGuests(s, "", "CONFIRMED")).toEqual([]);
});

const partyList = {
  invitations: [
    { id: "oliveira", name: "Família Oliveira" },
    { id: "silva", name: "Família Silva" },
  ],
  guests: [
    {
      id: "godmother",
      name: "Maria Oliveira",
      invitation_id: "oliveira",
      party_role: "MADRINHA",
      greeting_form: "MASCULINE",
    },
    {
      id: "godfather",
      name: "João Oliveira",
      invitation_id: "oliveira",
      party_role: "PADRINHO",
      greeting_form: "FEMININE",
    },
    {
      id: "common",
      name: "João Comum",
      invitation_id: "oliveira",
      group_label: "PADRINHO",
      greeting_form: "MASCULINE",
    },
    {
      id: "removed",
      name: "Maria Sem promoção",
      invitation_id: "silva",
      party_role: null,
      greeting_form: "FEMININE",
    },
    {
      id: "other",
      name: "Álvaro Silva",
      invitation_id: "silva",
      party_role: "PADRINHO",
    },
  ],
  rsvps: [],
} as unknown as Snapshot;
it.each([
  ["PADRINHO", ["other", "godfather"]],
  ["MADRINHA", ["godmother"]],
  ["WEDDING_PARTY", ["other", "godfather", "godmother"]],
] as [string, string[]][])(
  "filters %s using current party_role only, preserving alphabetical order",
  (filter, ids) => {
    const before = JSON.stringify(partyList);
    expect(listGuests(partyList, "", filter).map((g) => g.id)).toEqual(ids);
    expect(JSON.stringify(partyList)).toBe(before);
  },
);
it.each([
  ["PADRINHO", "João", ["godfather"]],
  ["MADRINHA", "maria", ["godmother"]],
  ["WEDDING_PARTY", "Oliveira", ["godfather", "godmother"]],
  ["PADRINHO", "Família Oliveira", ["godfather"]],
  ["MADRINHA", "Família Oliveira", ["godmother"]],
  ["WEDDING_PARTY", "Família Silva", ["other"]],
  ["PADRINHO", "Maria", []],
] as [string, string, string[]][])(
  "combines %s with the existing name/family search %s",
  (filter, query, ids) => {
    expect(listGuests(partyList, query, filter).map((g) => g.id)).toEqual(ids);
  },
);
it("stops listing a removed promotion and keeps all existing list semantics", () => {
  const updated = {
    ...partyList,
    guests: partyList.guests.map((g) =>
      g.id === "godfather" ? { ...g, party_role: null } : g,
    ),
  };
  expect(listGuests(updated, "João", "PADRINHO")).toEqual([]);
  expect(listGuests(partyList, "", "ALL").map((g) => g.id)).toEqual([
    "other",
    "common",
    "godfather",
    "godmother",
    "removed",
  ]);
  expect(
    listGuests(partyList, "Família Silva", "PENDING").map((g) => g.id),
  ).toEqual(["other", "removed"]);
});
