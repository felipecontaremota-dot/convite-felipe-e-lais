import { describe, expect, it } from "vitest";
import {
  checkinOperatorLabel,
  operationalGuests,
  operationalName,
} from "../src/features/ceremonial/domain";
import type { Snapshot } from "../src/types/domain";
const fixture = () =>
  ({
    invitations: [
      { id: "u", active: true, kind: "FAMILY", name: "Família Romão" },
      {
        id: "archived",
        active: true,
        archived_at: "2026-01-01",
        name: "Arquivada",
      },
    ],
    guests: [
      { id: "z", invitation_id: "u", name: "Zélia", party_role: null },
      { id: "a", invitation_id: "u", name: "Ágata", party_role: "MADRINHA" },
      { id: "b", invitation_id: "u", name: "Bruno", party_role: "PADRINHO" },
      { id: "x", invitation_id: "archived", name: "A antiga" },
    ],
    rsvps: [
      { guest_id: "z", status: "CONFIRMED" },
      { guest_id: "a", status: "CONFIRMED" },
      { guest_id: "b", status: "PENDING", responded_at: "2026-01-01" },
    ],
  }) as unknown as Snapshot;
describe("ceremonial operations", () => {
  it("sorts names in Portuguese and uses accent-insensitive family/name search", () => {
    expect(operationalGuests(fixture()).map((g) => g.name)).toEqual([
      "Ágata",
      "Zélia",
    ]);
    expect(operationalGuests(fixture(), "agATA").map((g) => g.id)).toEqual([
      "a",
    ]);
    expect(operationalGuests(fixture(), "ROMAO")).toHaveLength(2);
    expect(operationalName("  JOÃO  ")).toBe("joao");
  });
  it("uses only real promotions and preserves all RSVP states through explicit filters", () => {
    expect(
      operationalGuests(fixture(), "", "ALL", true).map((g) => g.id),
    ).toEqual(["a", "b"]);
    expect(operationalGuests(fixture(), "", "MAYBE").map((g) => g.id)).toEqual([
      "b",
    ]);
    expect(operationalGuests(fixture(), "", "PENDING")).toHaveLength(0);
    expect(operationalGuests(null)).toHaveLength(0);
  });
});

describe("check-in operator labels", () => {
  it.each([
    ["ADMIN", "Noivos"],
    ["CEREMONIALIST", "Cerimonialista"],
    [null, "Operador não identificado"],
    [undefined, "Operador não identificado"],
    ["GUEST", "Operador não identificado"],
    ["unknown-uuid", "Operador não identificado"],
  ])("maps %s without displaying identity", (role, label) => {
    expect(checkinOperatorLabel(role)).toBe(label);
  });
});
