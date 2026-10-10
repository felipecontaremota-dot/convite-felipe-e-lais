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

it("pending and transport errors keep request IDs; definitive results permit a new operation", async () => {
  const { retainedInvitationRequest } =
    await import("../src/features/guests/invitationDelivery");
  const requests = new Map<string, string>();
  let ids = 0;
  const used: string[] = [];
  const make = () => `request-${++ids}`;
  const send = async (request: string) => {
    used.push(request);
    return {
      message: "unknown",
      complete: false,
      pending: 1,
      sent: 1,
      skipped: 1,
      failed: 0,
    };
  };
  await retainedInvitationRequest(requests, "bulk", make, send);
  await retainedInvitationRequest(requests, "bulk", make, send);
  expect(used).toEqual(["request-1", "request-1"]);
  expect(requests.get("bulk")).toBe("request-1");
  await expect(
    retainedInvitationRequest(requests, "bulk", make, async () => {
      throw Error("transport");
    }),
  ).rejects.toThrow();
  expect(requests.get("bulk")).toBe("request-1");
  await retainedInvitationRequest(requests, "bulk", make, async (request) => {
    used.push(request);
    return {
      message: "done",
      complete: true,
      pending: 0,
      sent: 2,
      skipped: 1,
      failed: 0,
    };
  });
  expect(requests.has("bulk")).toBe(false);
  await retainedInvitationRequest(requests, "bulk", make, send);
  expect(used.at(-1)).toBe("request-2");
});
