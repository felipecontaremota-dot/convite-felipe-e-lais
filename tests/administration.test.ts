import { describe, it, expect, vi } from "vitest";
import {
  brazilPhone,
  formatPhone,
  guestContact,
  listGuests,
  GROUPS,
} from "../src/features/guests/adminDomain";
import type { Snapshot, WeddingEvent } from "../src/types/domain";
import {
  nativeMapOptions,
  transportLinks,
} from "../src/features/location/transportLinks";
import { demoAccess } from "../src/repositories/demoAccess";
const event: WeddingEvent = {
  id: "event",
  title: "Casamento",
  starts_at: "2026-12-15",
  timezone: "America/Sao_Paulo",
  venue_name: "Villarejo Eventos",
  address: "Rua do Evento, 12",
  gps_url: "https://maps.test/local",
  latitude: null,
  longitude: null,
};
it("Brazil phone paste, country prefix, visual mask and leading zeros", () => {
  expect(brazilPhone("+55 (62) 9 9999-0047")).toBe("62999990047");
  expect(formatPhone("+55 (62) 99999-0047")).toBe("(62) 9 9999-0047");
  expect(formatPhone("6233330047")).toBe("(62) 3333-0047");
  expect(formatPhone("12345678901234")).toBe("12345678901234");
  expect(
    guestContact.safeParse({
      whatsapp: brazilPhone(formatPhone("12345678901234")),
      email: "",
    }).success,
  ).toBe(false);
  expect(
    guestContact.safeParse({ whatsapp: "62999990047", email: "a@example.com" })
      .success,
  ).toBe(true);
  expect(guestContact.safeParse({ whatsapp: "", email: "" }).success).toBe(
    true,
  );
  expect(
    guestContact.safeParse({ whatsapp: "", email: "invalid" }).success,
  ).toBe(false);
});
it("PT-BR alphabetical ordering and exact group/RSVP/search filters", () => {
  const data = {
    guests: [
      { id: "1", name: "José", invitation_id: "f", group_label: GROUPS[0] },
      { id: "2", name: "Ágata", invitation_id: "f", group_label: GROUPS[1] },
      { id: "3", name: "Bruno", invitation_id: "i", group_label: GROUPS[2] },
    ],
    invitations: [
      { id: "f", name: "Família" },
      { id: "i", name: "Bruno" },
    ],
    rsvps: [
      { guest_id: "1", status: "CONFIRMED" },
      { guest_id: "2", status: "PENDING" },
      { guest_id: "3", status: "DECLINED" },
    ],
  } as Snapshot;
  expect(listGuests(data, "", "ALL").map((g) => g.name)).toEqual([
    "Ágata",
    "Bruno",
    "José",
  ]);
  expect(listGuests(data, "", GROUPS[0]!).map((g) => g.id)).toEqual(["1"]);
  expect(listGuests(data, "", "PENDING").map((g) => g.id)).toEqual(["2"]);
  expect(listGuests(data, "Bruno", "DECLINED").map((g) => g.id)).toEqual(["3"]);
});
describe("official transport destinations", () => {
  it("offers HTTPS GPS, encoded map/address fallbacks and no invented 99 URI", () => {
    const links = transportLinks(event);
    expect(links.gps).toBe("https://maps.test/local");
    expect(links.google).toContain(encodeURIComponent(event.address!));
    expect(links.waze).toContain("q=Rua%20do%20Evento");
    expect(links.uber).toContain(
      "dropoff[formatted_address]=Rua%20do%20Evento",
    );
    expect(
      transportLinks({ ...event, gps_url: "javascript:alert(1)" }).gps,
    ).toBeNull();
    expect(JSON.stringify(links)).not.toContain("taxis99:");
  });
  it.each(["ios", "android"] as const)(
    "only available apps on %s; errors fail to browser/share fallback",
    async (os) => {
      const canOpen = vi.fn(async (url: string) => url.startsWith("waze:"));
      expect(await nativeMapOptions(event, os, canOpen)).toEqual([
        {
          label: "Waze",
          url: "waze://?q=Rua%20do%20Evento%2C%2012&navigate=yes",
          available: true,
        },
      ]);
      expect(canOpen).toHaveBeenCalledWith(
        expect.stringMatching(
          os === "ios" ? /^comgooglemaps:/ : /^google.navigation:/,
        ),
      );
      expect(
        await nativeMapOptions(event, os, async () => {
          throw Error("unavailable");
        }),
      ).toEqual([]);
    },
  );
});
it("demo transactions reject the entire batch before changing a valid member", async () => {
  const s = {
    event,
    invitations: [
      {
        id: "i",
        event_id: "event",
        name: "Individual",
        kind: "INDIVIDUAL",
        active: true,
        version: 1,
        primary_guest_id: "g",
      },
      {
        id: "f",
        event_id: "event",
        name: "Família",
        pin: "0047",
        link_active: true,
        kind: "FAMILY",
        active: true,
        version: 1,
        primary_guest_id: null,
      },
    ],
    guests: [{ id: "g", invitation_id: "i", version: 1, name: "Guest" }],
    rsvps: [],
    contacts: [],
    credentials: [],
  } as unknown as Snapshot;
  const db = { snapshot: s, codes: {} };
  const gen = {
    id: () => "id",
    token: () => "x".repeat(48),
    hash: async () => "hash",
    pin: () => "0047",
  };
  await expect(
    demoAccess(
      db,
      "FAMILY_ADD_MEMBERS",
      {
        target_id: "f",
        target_version: 1,
        guests: [
          { id: "g", version: 1, invitation_version: 1 },
          { id: "missing", version: 1, invitation_version: 1 },
        ],
      },
      gen,
    ),
  ).rejects.toThrow("conflict");
  expect(s.guests[0]?.invitation_id).toBe("i");
});
