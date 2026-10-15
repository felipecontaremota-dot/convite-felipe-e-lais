import { describe, it, expect } from "vitest";
import { readSheet } from "read-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import type { Snapshot } from "../src/types/domain";
import {
  guestExportRows,
  guestExportFilename,
  guestExportHeaders,
  exportWhatsApp,
} from "../src/features/guests/guestExport";
import { guestWorkbook } from "../src/features/guests/guestWorkbook";
function snapshot() {
  return {
    role: "ADMIN",
    event: { id: "e" },
    guests: [
      {
        id: "b",
        event_id: "e",
        invitation_id: "f",
        name: "Bruno",
        group_label: "Convidado(a) do noivo",
        is_child: false,
      },
      {
        id: "a",
        event_id: "e",
        invitation_id: "f",
        name: "Ágata",
        group_label: "Convidado(a) da noiva",
        is_child: true,
      },
      {
        id: "c",
        event_id: "e",
        invitation_id: "i",
        name: "Carla",
        group_label: "",
        is_child: false,
        is_adolescent: true,
      },
    ],
    invitations: [
      {
        id: "f",
        event_id: "e",
        name: "Família teste",
        pin: "0047",
        sharing_code: "0123456789abcdef0123456789abcdef01234567",
      },
      { id: "i", event_id: "e", name: "Carla" },
    ],
    contacts: [
      { guest_id: "a", email: "a@example.test", whatsapp: "001234567890" },
    ],
    rsvps: [
      { event_id: "e", guest_id: "a", status: "CONFIRMED" },
      { event_id: "e", guest_id: "c", status: "DECLINED" },
    ],
    credentials: [{ secret: "SECRET_TOKEN" }],
  } as unknown as Snapshot;
}
describe("guest Excel export", () => {
  it("exports the complete filtered list in canonical order, not a visible page", () => {
    const s = snapshot();
    expect(guestExportRows(s, "", "ALL").map((r) => r[1])).toEqual([
      "Ágata",
      "Bruno",
      "Carla",
    ]);
    expect(guestExportRows(s, "", "Convidado(a) da noiva")).toHaveLength(1);
    expect(guestExportRows(s, "BRUNO", "ALL")[0][1]).toBe("Bruno");
    expect(guestExportRows(s, "família", "ALL")).toHaveLength(2);
    expect(guestExportRows(s, "família", "Convidado(a) do noivo")[0][1]).toBe(
      "Bruno",
    );
    expect(guestExportRows(s, "", "CONFIRMED")).toHaveLength(1);
    expect(guestExportRows(s, "não existe", "ALL")).toEqual([]);
    s.guests = Array.from({ length: 1200 }, (_, i) => ({
      ...s.guests[0],
      id: `g${i}`,
      name: `Convidado ${i}`,
    }));
    expect(guestExportRows(s, "", "ALL")).toHaveLength(1200);
  });
  it("retains text contacts, empty fields, actual RSVP and existing age indicators only", () => {
    const rows = guestExportRows(snapshot(), "", "ALL");
    expect(rows[0]).toEqual([
      1,
      "Ágata",
      "001234567890",
      "Convidado(a) da noiva",
      "",
      "0047",
      "Família teste",
      "a@example.test",
      "Confirmado",
      "Criança",
    ]);
    expect(rows[1].slice(7)).toEqual(["", "Pendente", "Adulto"]);
    expect(rows[2].slice(8)).toEqual(["Não irá", "Adolescente"]);
    expect(rows[2][4]).toBe("");
    expect(rows[2][5]).toBe("");
    const s = snapshot();
    delete s.guests[0].is_child;
    expect(guestExportRows(s, "Bruno", "ALL")[0][9]).toBe("");
  });
  it.each([null, "GUEST", "CEREMONIALIST"])(
    "rejects role %s without new permissions",
    (role) => {
      const s = snapshot();
      s.role = role as Snapshot["role"];
      expect(() => guestExportRows(s, "", "ALL")).toThrow("não autorizada");
    },
  );
  it("isolates event data and allowlists ten columns without credentials", () => {
    const s = snapshot();
    s.guests.push({ ...s.guests[0], id: "foreign", event_id: "other" });
    const rows = guestExportRows(s, "", "ALL");
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 10)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/SECRET_/);
  });
  it("uses the generation date in São Paulo for safe filenames", () => {
    expect(guestExportFilename(new Date("2026-10-16T01:00:00Z"))).toBe(
      "Felipe_e_Lais_Lista_de_Convidados_15-10-2026.xlsx",
    );
  });
  it("writes real OOXML with formatting, freeze, filter, text phones and no executable formulas", async () => {
    const rows = guestExportRows(snapshot(), "", "ALL");
    rows.push([
      4,
      '=HYPERLINK("https://invalid.test")',
      "+SUM(1,1)",
      "-2+3",
      "00123",
      "@SUM(A1)",
      "",
      "",
      "",
      "",
    ]);
    const bytes = new Uint8Array(
      await (
        await guestWorkbook(rows, new Date("2026-10-15T15:00:00Z"))
      ).arrayBuffer(),
    );
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
    const zip = unzipSync(bytes),
      xml = strFromU8(zip["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('ref="A5:J9"');
    expect(xml).toContain('ySplit="5"');
    expect(xml).not.toMatch(/<f[ >]/);
    expect(Object.keys(zip).join()).not.toMatch(/externalLink|vbaProject/);
    const all = Object.values(zip).map(strFromU8).join();
    expect(all).not.toMatch(/SECRET_/);
    expect(all).toContain("18324F");
    const result = await readSheet(Buffer.from(bytes), "Convidados");
    expect(result).toBeDefined();
    // Independent reader confirms the file and text values can be opened.
    const sheet = result;
    expect(sheet[4]).toEqual(guestExportHeaders);
    expect(sheet[5][2]).toBe("001234567890");
    expect(sheet[8][1]).toBe('=HYPERLINK("https://invalid.test")');
  });
  it.each([
    "62998784778",
    "(62) 9 9878-4778",
    "+55 (62) 9 9878-4778",
    "5562998784778",
  ])("masks %s only for export", (value) => {
    expect(exportWhatsApp(value)).toBe("(62) 9 9878-4778");
  });
  it("preserves local DDD 55, missing and legacy phones without inventing digits", () => {
    expect(exportWhatsApp("55998784778")).toBe("(55) 9 9878-4778");
    expect(exportWhatsApp("")).toBe("");
    expect(exportWhatsApp("123")).toBe("123");
    expect(exportWhatsApp("556233334778")).toBe("(62) 3333-4778");
  });
  it("maps each person to the actual unit link/PIN, leaves unavailable links empty and never exports auth credentials", async () => {
    const s = snapshot();
    s.invitations[1].sharing_code = "abcdef0123456789abcdef0123456789abcdef01";
    s.invitations[1].pin = "0001";
    const unchanged = JSON.stringify(s);
    const rows = guestExportRows(s, "", "ALL", "https://example.test/wedding/");
    expect(JSON.stringify(s)).toBe(unchanged);
    expect(guestExportHeaders).toEqual([
      "Nº",
      "Nome",
      "WhatsApp",
      "Tag",
      "Convite",
      "Senha",
      "Família",
      "E-mail",
      "Presença",
      "Tipo",
    ]);
    expect(rows[0].slice(4, 7)).toEqual([
      "https://example.test/wedding/c/" + s.invitations[0].sharing_code,
      "0047",
      "Família teste",
    ]);
    expect(rows[1].slice(4, 7)).toEqual(rows[0].slice(4, 7));
    expect(rows[2].slice(4, 7)).toEqual([
      "https://example.test/wedding/c/" + s.invitations[1].sharing_code,
      "0001",
      "Carla",
    ]);
    const sheet = await readSheet(
      Buffer.from(await (await guestWorkbook(rows, new Date())).arrayBuffer()),
      "Convidados",
    );
    expect(sheet[4]).toEqual(guestExportHeaders);
    expect(sheet[5]).toEqual([
      1,
      "Ágata",
      "001234567890",
      "Convidado(a) da noiva",
      rows[0][4],
      "0047",
      "Família teste",
      "a@example.test",
      "Confirmado",
      "Criança",
    ]);
    expect(sheet[7][5]).toBe("0001");
    s.invitations[0].link_active = false;
    expect(guestExportRows(s, "", "ALL", "https://example.test")[0][4]).toBe(
      "",
    );
    expect(guestExportRows(s, "", "ALL", "http://unsafe.test")[2][4]).toBe("");
    expect(JSON.stringify(rows)).not.toContain("SECRET_TOKEN");
  });
  it("rejects empty workbooks", async () => {
    await expect(guestWorkbook([], new Date())).rejects.toThrow(
      "Nenhum convidado",
    );
  });
});
