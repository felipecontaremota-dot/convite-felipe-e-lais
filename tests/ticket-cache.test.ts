import { beforeEach, expect, it, vi } from "vitest";
import { getDeviceTicket } from "../src/repositories/tickets";
import { familyTicketToken, ticketToken } from "../src/utils/security";
const values = new Map<string, unknown>();
vi.mock("../src/storage/driver", () => ({
  readCache: async (key: string) => values.get(key) ?? null,
  updateCache: async (key: string, update: (value: unknown) => unknown) => {
    values.set(key, update(values.get(key) ?? null));
  },
}));
vi.mock("../src/repositories/demo", () => ({
  hashToken: async (token: string) => `hash:${token}`,
}));
beforeEach(() => values.clear());
it("family QR cannot be parsed as individual or website access", () => {
  const token = "a".repeat(64);
  expect(familyTicketToken(`wedding://family-ticket/${token}`)).toBe(token);
  expect(ticketToken(`wedding://family-ticket/${token}`)).toBeNull();
  expect(familyTicketToken(`wedding://ticket/${token}`)).toBeNull();
  expect(familyTicketToken(token)).toBeNull();
  expect(
    familyTicketToken(`wedding://family-ticket/${token}?guest=other`),
  ).toBeNull();
});
it("offline regeneration and failed request preserve the stored QR", async () => {
  const original = { guest_id: "family:unit", token: "original" };
  values.set("tickets:scope", [original]);
  const issue = vi.fn().mockRejectedValue(Error("Connection failed"));
  await expect(
    getDeviceTicket("scope", original.guest_id, [], false, true, issue),
  ).rejects.toThrow("Conecte-se");
  expect(issue).not.toHaveBeenCalled();
  expect(values.get("tickets:scope")).toEqual([original]);
  await expect(
    getDeviceTicket("scope", original.guest_id, [], true, true, issue),
  ).rejects.toThrow("Connection failed");
  expect(values.get("tickets:scope")).toEqual([original]);
});
it("simultaneous confirmations issue once and replace only the selected credential", async () => {
  values.set("tickets:scope", [{ guest_id: "other", token: "keep" }]);
  const issue = vi.fn(async () => ({ guest_id: "family:unit", token: "new" }));
  const result = await Promise.all([
    getDeviceTicket("scope", "family:unit", [], true, true, issue),
    getDeviceTicket("scope", "family:unit", [], true, true, issue),
  ]);
  expect(issue).toHaveBeenCalledTimes(1);
  expect(result[0]).toEqual(result[1]);
  expect(values.get("tickets:scope")).toEqual([
    { guest_id: "other", token: "keep" },
    { guest_id: "family:unit", token: "new" },
  ]);
});
it("explicit regeneration waits for initial issuance instead of silently accepting it", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const issue = vi.fn(async (regenerate: boolean) => {
    if (!regenerate) await gate;
    return { guest_id: "guest", token: regenerate ? "replacement" : "initial" };
  });
  const initial = getDeviceTicket("scope", "guest", [], true, false, issue);
  const regeneration = getDeviceTicket("scope", "guest", [], true, true, issue);
  release();
  expect((await initial).token).toBe("initial");
  expect((await regeneration).token).toBe("replacement");
  expect(issue.mock.calls).toEqual([[false], [true]]);
});
