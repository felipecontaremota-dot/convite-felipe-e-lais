import { describe, it, expect } from "vitest";
import {
  profileConfirmationSchema,
  confirmationName,
  profileConfirmationPending,
  confirmationMembers,
} from "../src/features/guests/profileConfirmation";
import type { Snapshot } from "../src/types/domain";
const valid = {
  name: "  Laís   Romão  ",
  email: " lais@example.test ",
  whatsapp: "+55 (62) 9 9999-4778",
};
describe("initial profile confirmation", () => {
  it("normalizes name, contacts and retains DDI without a word-count requirement", () => {
    expect(profileConfirmationSchema.parse(valid)).toEqual({
      name: "Laís Romão",
      email: "lais@example.test",
      whatsapp: "5562999994778",
    });
    expect(
      profileConfirmationSchema.safeParse({ ...valid, name: "Ana" }).success,
    ).toBe(true);
    expect(confirmationName("Lai\u0301s\u00a0 Romão")).toBe("Laís Romão");
  });
  for (const data of [
    { name: "" },
    { name: " ", whatsapp: "" },
    { name: "a".repeat(201) },
    { name: "Laís\u200b" },
    { email: "" },
    { email: "bad@" },
    { email: "bad" },
    { email: "@" },
    { email: "no space@example.test" },
    { email: "a".repeat(321) },
    { whatsapp: "" },
    { whatsapp: "629888" },
    { whatsapp: "6299999999" },
    { whatsapp: "06299999999" },
    { whatsapp: "62999999999letters" },
  ])
    it(`rejects invalid fields ${JSON.stringify(data)}`, () =>
      expect(
        profileConfirmationSchema.safeParse({ ...valid, ...data }).success,
      ).toBe(false));
  it("accepts Brazilian local mobile digits", () =>
    expect(
      profileConfirmationSchema.parse({ ...valid, whatsapp: "62999994778" })
        .whatsapp,
    ).toBe("62999994778"));
  const snapshot = () =>
    ({
      role: "GUEST",
      event: { id: "event" },
      current_invitation_id: "unit",
      invitations: [{ id: "unit" }],
      guests: [
        {
          id: "one",
          event_id: "event",
          invitation_id: "unit",
          profile_confirmed_at: null,
        },
        { id: "other", event_id: "different", invitation_id: "unit" },
      ],
      profile_confirmation: { supported: true, guest_id: null },
    }) as unknown as Snapshot;
  it("never chooses an arbitrary family member", () => {
    const s = snapshot();
    expect(confirmationMembers(s).map((g) => g.id)).toEqual(["one"]);
    expect(profileConfirmationPending(s)).toBe(true);
    s.profile_confirmation!.guest_id = "other";
    expect(profileConfirmationPending(s)).toBe(true);
  });
  it("uses server-confirmed guest state, independent of a browser flag", () => {
    const s = snapshot();
    s.profile_confirmation!.guest_id = "one";
    expect(profileConfirmationPending(s)).toBe(true);
    s.guests[0]!.profile_confirmed_at = "2026-10-15T00:00:00Z";
    expect(profileConfirmationPending(s)).toBe(false);
  });
  it("never blocks legacy backend, public entry or staff", () => {
    expect(profileConfirmationPending(null)).toBe(false);
    const s = snapshot();
    s.profile_confirmation = undefined;
    expect(profileConfirmationPending(s)).toBe(false);
    s.profile_confirmation = { supported: true };
    s.role = "ADMIN";
    expect(profileConfirmationPending(s)).toBe(false);
  });
});
