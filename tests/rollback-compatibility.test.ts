import { describe, expect, it } from "vitest";
import { restoredRsvpStatus } from "../src/features/rsvp/compatibility";
import { RSVP_LABELS } from "../src/features/guests/adminDomain";
import { rsvpSchema } from "../src/utils/security";

describe("PR21 read compatibility without new MAYBE writes", () => {
  it("renders stored MAYBE as undecided without changing the stored record", () => {
    const record = Object.freeze({
      status: "MAYBE" as const,
      note: "Preserve",
    });
    expect(restoredRsvpStatus(record.status)).toBe("PENDING");
    expect(RSVP_LABELS[record.status]).toBe("Ainda vou decidir");
    expect(record).toEqual({ status: "MAYBE", note: "Preserve" });
  });
  it.each(["PENDING", "CONFIRMED", "DECLINED"] as const)(
    "preserves baseline %s and accepts explicit saves",
    (status) => {
      expect(restoredRsvpStatus(status)).toBe(status);
      expect(rsvpSchema.parse({ status, dietary: "", note: "" }).status).toBe(
        status,
      );
    },
  );
  it("defaults missing responses and rejects new MAYBE payloads", () => {
    expect(restoredRsvpStatus()).toBe("PENDING");
    expect(
      rsvpSchema.safeParse({ status: "MAYBE", dietary: "", note: "" }).success,
    ).toBe(false);
  });
});
