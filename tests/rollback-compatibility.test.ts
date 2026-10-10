import type { Contact } from "../src/types/domain";
import { MutationQueue } from "../src/storage/queue";
import { preserveContactRevocation } from "../src/features/guests/contactCompatibility";
import { describe, expect, it } from "vitest";
import { restoredRsvpStatus } from "../src/features/rsvp/compatibility";
import { RSVP_LABELS } from "../src/features/guests/adminDomain";
import { contactSchema, rsvpSchema } from "../src/utils/security";

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

describe("global opt-out in offline contact payloads and projections", () => {
  const revoked: Contact = {
    guest_id: "guest",
    email: "old@example.test",
    whatsapp: "",
    notifications_revoked: true,
    consent_in_app: false,
    consent_push: false,
    consent_email: false,
    consent_whatsapp: false,
  };
  const stale: Contact = {
    guest_id: "guest",
    email: "new@example.test",
    whatsapp: "",
    consent_in_app: true,
    consent_push: true,
    consent_email: true,
    consent_whatsapp: true,
  };
  it("preserves the marker through schema parsing, serialization and an offline queue", async () => {
    const values = new Map<string, string>();
    const queue = new MutationQueue(
      {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => {
          values.set(key, value);
        },
        removeItem: async (key) => {
          values.delete(key);
        },
      },
      "queue",
    );
    const payload = {
      guest_id: "guest",
      ...contactSchema.parse(preserveContactRevocation(revoked, stale)),
    };
    await queue.enqueue({
      mutationId: "contact-1",
      type: "CONTACT_UPDATE",
      payload,
      createdAt: "now",
      attempts: 0,
      lastError: null,
    });
    await queue.flush(async () => {
      throw Error("offline");
    });
    const [pending] = await queue.list();
    expect(pending.payload).toMatchObject({
      notifications_revoked: true,
      email: "new@example.test",
      consent_in_app: false,
      consent_push: false,
      consent_email: false,
      consent_whatsapp: false,
    });
    expect(
      preserveContactRevocation(
        undefined,
        pending.payload as unknown as Contact,
      ),
    ).toEqual(payload);
    expect(pending.mutationId).toBe("contact-1");
  });
  it("protects older queued payloads lacking the marker against cached/server opt-out", () => {
    expect(preserveContactRevocation(revoked, stale)).toEqual({
      ...revoked,
      email: "new@example.test",
    });
    expect(revoked.email).toBe("old@example.test");
    expect(stale.consent_email).toBe(true);
  });
  it("keeps ordinary per-channel consent changes when no global opt-out exists", () => {
    expect(preserveContactRevocation(undefined, stale)).toEqual(stale);
  });
});
