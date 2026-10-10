import { it, expect } from "vitest";
import { lastInvitationDelivery } from "../src/features/guests/invitationDelivery";
const row = {
  id: "d",
  guest_id: "a",
  invitation_id: "family",
  recipient_email: "same@example.test",
  status: "sent",
  sent_at: "2026-10-09T19:00:00Z",
  created_at: "2026-10-09T18:00:00Z",
};
it("family dedup still shows delivery to the same normalized email/access unit", () => {
  expect(
    lastInvitationDelivery([row], "b", "family", " Same@Example.test "),
  ).toEqual(row);
  expect(
    lastInvitationDelivery([row], "b", "other-unit", "same@example.test"),
  ).toBeUndefined();
  expect(
    lastInvitationDelivery([row], "b", "family", "other@example.test"),
  ).toBeUndefined();
});
it("last means accepted sent_at, not reservation order; failed/pending not shown sent", () => {
  const later = {
    ...row,
    id: "later",
    sent_at: "2026-10-09T20:00:00Z",
    created_at: "2026-10-09T17:00:00Z",
  };
  expect(lastInvitationDelivery([row, later], "a", "family", "")).toEqual(
    later,
  );
  expect(
    lastInvitationDelivery(
      [{ ...row, status: "failed", sent_at: null }],
      "a",
      "family",
      "",
    ),
  ).toBeUndefined();
});
