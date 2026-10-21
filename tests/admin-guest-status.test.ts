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
