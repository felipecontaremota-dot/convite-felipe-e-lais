import { describe, it, expect } from "vitest";
import type { Snapshot } from "../src/types/domain";
import {
  filteredGuestExportRows,
  toggleExportFilter,
  exportFilterColumns,
  type ExportFilter,
} from "../src/features/guests/guestExportFilters";
import { guestPdf } from "../src/features/guests/guestPdf";
import { guestWorkbook } from "../src/features/guests/guestWorkbook";
import { readSheet } from "read-excel-file/node";
const data = {
  role: "ADMIN",
  event: { id: "e" },
  invitations: [],
  contacts: [],
  guests: [
    {
      id: "a",
      event_id: "e",
      name: "Ágata",
      group_label: "Familiar da noiva",
      invitation_sent: true,
      party_role: "MADRINHA",
    },
    {
      id: "b",
      event_id: "e",
      name: "Bruno",
      group_label: "Familiar do noivo",
      invitation_sent: false,
    },
    {
      id: "c",
      event_id: "e",
      name: "Carla",
      group_label: "Convidado(a) da noiva",
      invitation_sent: false,
      party_role: "MADRINHA",
    },
    {
      id: "d",
      event_id: "e",
      name: "Davi",
      group_label: "Convidado(a) do noivo",
      invitation_sent: true,
      party_role: "PADRINHO",
    },
    { id: "foreign", event_id: "other", name: "Other" },
  ],
  rsvps: [
    { guest_id: "a", event_id: "e", status: "CONFIRMED" },
    { guest_id: "c", event_id: "e", status: "DECLINED" },
    {
      guest_id: "d",
      event_id: "e",
      status: "PENDING",
      responded_at: "2026-10-25",
    },
  ],
} as unknown as Snapshot;
const names = (filters: ExportFilter[]) =>
  filteredGuestExportRows(data, filters).map((r) => r[1]);
describe("export filters", () => {
  it("defines exactly 12 options and exclusive all without duplicate selections", () => {
    expect(exportFilterColumns.map((c) => c.length)).toEqual([4, 4, 4]);
    expect(toggleExportFilter(["Confirmados"], "Todos")).toEqual(["Todos"]);
    expect(toggleExportFilter(["Todos"], "Confirmados")).toEqual([
      "Confirmados",
    ]);
    expect(toggleExportFilter(["Confirmados"], "Confirmados")).toEqual([]);
  });
  it.each([
    [["Todos"], ["Ágata", "Bruno", "Carla", "Davi"]],
    [
      ["Familiar da noiva", "Familiar do noivo"],
      ["Ágata", "Bruno"],
    ],
    [
      ["Confirmados", "Talvez"],
      ["Ágata", "Davi"],
    ],
    [["Pendentes"], ["Bruno"]],
    [["Não irão"], ["Carla"]],
    [["Convites não enviados"], ["Bruno", "Carla"]],
    [
      ["Convites enviados", "Convites não enviados"],
      ["Ágata", "Bruno", "Carla", "Davi"],
    ],
    [["Familiar do noivo", "Pendentes", "Convites não enviados"], ["Bruno"]],
    [["Padrinho/Madrinha"], ["Ágata", "Carla", "Davi"]],
    [["Padrinho/Madrinha", "Confirmados"], ["Ágata"]],
    [["Confirmados", "Convites não enviados"], []],
    [[], []],
  ] as [ExportFilter[], string[]][])(
    "applies categories %j",
    (filters, expected) => expect(names(filters)).toEqual(expected),
  );
  it("keeps source data unchanged, rejects unauthorized access and exports actual Talvez", () => {
    const before = JSON.stringify(data);
    expect(filteredGuestExportRows(data, ["Talvez"])[0][8]).toBe("Talvez");
    expect(JSON.stringify(data)).toBe(before);
    expect(() =>
      filteredGuestExportRows({ ...data, role: "GUEST" }, ["Todos"]),
    ).toThrow();
  });
  it("both formats use identical filtered rows and retain existing columns", async () => {
    const rows = filteredGuestExportRows(data, ["Confirmados"]);
    const date = new Date("2026-10-25T12:00:00Z");
    const excel = await guestWorkbook(rows, date);
    const sheet = await readSheet(Buffer.from(await excel.arrayBuffer()));
    expect(sheet[5][1]).toBe("Ágata");
    expect(sheet[5]).toHaveLength(10);
    const pdf = guestPdf(rows, date);
    const text = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
    expect(text).toContain("Ágata");
    expect(text).not.toContain("Bruno");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(() => guestPdf([], date)).toThrow();
  });
});
