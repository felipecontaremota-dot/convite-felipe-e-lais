import { it, expect } from "vitest";
import {
  loadEntrySnapshot,
  validateEntrySnapshot,
} from "../src/features/auth/entry";
import type { Snapshot } from "../src/types/domain";
const snapshot = {
  role: "GUEST",
  current_invitation_id: "unit-a",
  event: { id: "event-a" },
  invitations: [{ id: "unit-a" }],
  guests: [{ event_id: "event-a", invitation_id: "unit-a" }],
} as Snapshot;
it("authoritative snapshot opens only the bound unit", () =>
  expect(validateEntrySnapshot(snapshot, "event-a")).toBe(snapshot));
it.each([
  { role: null },
  { role: "ADMIN" },
  { current_invitation_id: null },
  { current_invitation_id: "unit-b" },
  { event: { id: "event-b" } },
  { guests: [{ event_id: "event-a", invitation_id: "unit-b" }] },
  { invitations: [] },
])("rejects incompatible snapshot %j", (change) =>
  expect(() =>
    validateEntrySnapshot({ ...snapshot, ...change } as Snapshot, "event-a"),
  ).toThrow(/carregar o convite/),
);
it("snapshot failure after binding is recoverable and never an invalid credential", async () => {
  await expect(
    loadEntrySnapshot(async () => {
      throw Error("backend detail");
    }, "event-a"),
  ).rejects.toMatchObject({ code: "ENTRY_LOAD" });
  await expect(
    loadEntrySnapshot(async () => snapshot, "event-a"),
  ).resolves.toBe(snapshot);
});

it("a concurrent binding switch cannot open the other unit", () =>
  expect(() => validateEntrySnapshot(snapshot, "event-a", "unit-b")).toThrow(
    /carregar o convite/,
  ));
it("legacy snapshot is accepted only in the explicit link compatibility path", () => {
  const legacy = { ...snapshot, current_invitation_id: undefined };
  expect(() => validateEntrySnapshot(legacy, "event-a")).toThrow();
  expect(validateEntrySnapshot(legacy, "event-a", null, true)).toBe(legacy);
});
