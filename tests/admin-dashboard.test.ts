import { describe, expect, it } from "vitest";
import { dashboardDetails } from "../src/features/admin/dashboard";
import type { Snapshot } from "../src/types/domain";
function fixture() {
  return {
    guests: ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      name: id,
      invitation_sent: i >= 2,
      invitation_id: i < 2 ? "f" : "i",
    })),
    invitations: [
      {
        id: "f",
        active: true,
        sent_at: null,
        sharing_code: "secret",
        pin: "0001",
        first_activated_at: "2026-01-01",
      },
      { id: "i", active: true, sent_at: "2026-01-01" },
    ],
    rsvps: [
      { guest_id: "a", status: "CONFIRMED", responded_at: null },
      { guest_id: "b", status: "DECLINED", responded_at: "2026-01-01" },
      { guest_id: "c", status: "PENDING", responded_at: "2026-01-01" },
      { guest_id: "d", status: "PENDING", responded_at: null },
      { guest_id: "not-a-guest", status: "CONFIRMED" },
    ],
  } as unknown as Snapshot;
}
describe("dashboard guest details", () => {
  it("uses individual guests and partitions explicit indecision from no answer, including missing records", () => {
    const { lists } = dashboardDetails(fixture());
    expect(lists.confirmed.map((g) => g.id)).toEqual(["a"]);
    expect(lists.declined.map((g) => g.id)).toEqual(["b"]);
    expect(lists.deciding.map((g) => g.id)).toEqual(["c"]);
    expect(lists.unanswered.map((g) => g.id)).toEqual(["d", "e"]);
    expect(
      lists.confirmed.length +
        lists.declined.length +
        lists.deciding.length +
        lists.unanswered.length,
    ).toBe(5);
  });
  it("partitions individual sending independently of unit receipts, credentials and activation", () => {
    const s = fixture();
    expect(dashboardDetails(s).lists.unsent.map((g) => g.id)).toEqual([
      "a",
      "b",
    ]);
    s.invitations[0]!.sent_at = "2026-01-01";
    s.invitations[0]!.active = false;
    expect(dashboardDetails(s).lists.unsent.map((g) => g.id)).toEqual([
      "a",
      "b",
    ]);
    s.guests[0]!.invitation_sent = true;
    const { lists } = dashboardDetails(s);
    expect(lists.unsent.map((g) => g.id)).toEqual(["b"]);
    expect(lists.sent).toHaveLength(4);
    expect(lists.sent.length + lists.unsent.length).toBe(s.guests.length);
  });
  it("reflects responses, edits, additions and removals without mutating the snapshot", () => {
    const s = fixture();
    const before = JSON.stringify(s);
    dashboardDetails(s);
    expect(JSON.stringify(s)).toBe(before);
    s.rsvps[2]!.status = "CONFIRMED";
    expect(dashboardDetails(s).lists.confirmed).toHaveLength(2);
    expect(dashboardDetails(s).lists.deciding).toHaveLength(0);
    s.rsvps[0]!.status = "DECLINED";
    expect(dashboardDetails(s).lists.declined).toHaveLength(2);
    s.guests.pop();
    expect(dashboardDetails(s).lists.unanswered).toHaveLength(1);
  });
  it("handles loading and empty categories", () => {
    expect(
      Object.values(dashboardDetails(undefined).lists).every(
        (list) => list.length === 0,
      ),
    ).toBe(true);
  });
});
