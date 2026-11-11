import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { guestPdf } from "../src/features/guests/guestPdf";
import { guestPdfAssetUrl } from "../src/features/guests/guestPdfAssetUrl";
import {
  guestPdfRows,
  guestPdfSummary,
  guestPdfTimestamp,
  type GuestPdfRow,
} from "../src/features/guests/guestPdfData";
import type { GuestExportData } from "../src/features/guests/guestExport";
import { readPdf, readPdfImages, pdfMonogram } from "./support/pdf";
const date = new Date("2026-11-10T19:56:00Z");
const row = (name = "Cláudia & Laís", note = ""): GuestPdfRow => ({
  name,
  note,
  family: "Família Silva",
  side: "Noiva",
  party: true,
});
const data = {
  role: "ADMIN",
  event: { id: "e" },
  invitations: [
    {
      id: "i",
      event_id: "e",
      name: "Família Silva",
      pin: "4778",
      sharing_code: "private-code",
    },
  ],
  contacts: [
    { guest_id: "a", email: "private@example.test", whatsapp: "62999999999" },
  ],
  guests: [
    {
      id: "z",
      event_id: "e",
      name: "Zélia",
      invitation_id: "i",
      group_label: "Familiar do noivo",
      admin_notes: " \n ",
      party_role: "MADRINHA",
    },
    {
      id: "a",
      event_id: "e",
      name: "Ágata",
      invitation_id: "i",
      group_label: "Convidado(a) da noiva",
      admin_notes: "  Nota integral\nSegunda linha  ",
    },
    {
      id: "b",
      event_id: "e",
      name: "Não irá",
      invitation_id: "i",
      admin_notes: "Nota secreta do ausente",
      party_role: "PADRINHO",
    },
    { id: "c", event_id: "e", name: "Pendente", invitation_id: "i" },
    { id: "d", event_id: "e", name: "Talvez", invitation_id: "i" },
    { id: "x", event_id: "other", name: "Outro evento" },
  ],
  rsvps: [
    { guest_id: "a", event_id: "e", status: "CONFIRMED" },
    { guest_id: "z", event_id: "e", status: "CONFIRMED" },
    { guest_id: "b", event_id: "e", status: "DECLINED" },
    {
      guest_id: "d",
      event_id: "e",
      status: "PENDING",
      responded_at: "2026-11-10",
    },
    { guest_id: "x", event_id: "other", status: "CONFIRMED" },
  ],
} as unknown as GuestExportData;
describe("ceremonial PDF", () => {
  it("preserves the original filename in Metro query paths and Pages/custom-domain paths", () => {
    const url = guestPdfAssetUrl(
      "/assets/?unstable_path=.%2Fassets%2Fbranding/Monograma%20Dourado%20F%20&%20L.png",
      "http://localhost:8081/inicio",
    );
    expect(url.searchParams.get("unstable_path")).toBe(
      "./assets/branding/Monograma Dourado F & L.png",
    );
    expect([...url.searchParams.keys()]).toEqual(["unstable_path"]);
    for (const prefix of ["", "/convite-felipe-e-lais"]) {
      const asset = `${prefix}/assets/assets/branding/Monograma Dourado F & L.hash.png`;
      const resolved = guestPdfAssetUrl(
        asset,
        `https://example.test${prefix}/convidados`,
      );
      expect(decodeURIComponent(resolved.pathname)).toBe(asset);
      expect(resolved.origin).toBe("https://example.test");
    }
    expect(() =>
      guestPdfAssetUrl(
        "https://external.test/image.png",
        "https://example.test",
      ),
    ).toThrow(/próprio aplicativo/);
  });
  it("embeds the exact original PNG once, centered at 26mm with original pixels and transparency", async () => {
    expect(createHash("sha256").update(pdfMonogram).digest("hex")).toBe(
      "4de9ceeafc38cb89e1ac5a87c21ac0f967eac0f863b9582180cb69fed67d16fc",
    );
    const rows = Array.from({ length: 65 }, (_, i) => row(`Nome ${i}`));
    const images = await readPdfImages(guestPdf(rows, date, pdfMonogram));
    expect(images).toHaveLength(1);
    const image = images[0]!;
    expect(image.page).toBe(1);
    expect([image.width, image.height]).toEqual([1695, 928]);
    // Hashes of the original RGBA pixels and alpha plane, independently decoded
    // from the official PNG: PDF embedding must not recolor or flatten anything.
    expect(image.rgbaHash).toBe(
      "4740ac99502cc07bec7863c21478329df18bb4b2706f98f448294b733a2aa91b",
    );
    expect(image.alphaHash).toBe(
      "735afd72460b5ac862c7a0ab4ad95b329b47203ae62ac939ba216d16c385643e",
    );
    const mm = 72 / 25.4;
    expect(image.transform[0]! / mm).toBeCloseTo(26, 6);
    expect(image.transform[3]! / mm).toBeCloseTo((26 * 928) / 1695, 6);
    expect((image.transform[4]! + image.transform[0]! / 2) / mm).toBeCloseTo(
      105,
      6,
    );
    expect(
      (841.89 - image.transform[5]! - image.transform[3]!) / mm,
    ).toBeCloseTo(12, 4);
  });
  it("projects only confirmed people in pt-BR order, with the canonical note and no secrets", () => {
    const before = JSON.stringify(data);
    const rows = guestPdfRows(data, ["Todos"]);
    expect(rows.map((r) => r.name)).toEqual(["Ágata", "Zélia"]);
    expect(rows[0]!.note).toBe("  Nota integral\nSegunda linha  ");
    expect(rows[0]!.side).toBe("Noiva");
    expect(rows[1]!.side).toBe("Noivo");
    expect(guestPdfSummary(rows)).toEqual({ confirmed: 2, party: 1, notes: 1 });
    expect(JSON.stringify(rows)).not.toMatch(
      /private|4778|62999999999|secreta/,
    );
    expect(JSON.stringify(data)).toBe(before);
    expect(
      guestPdfRows({ ...data, role: "CEREMONIALIST", contacts: [] }, ["Todos"]),
    ).toEqual(rows);
    expect(() => guestPdfRows({ ...data, role: "GUEST" }, ["Todos"])).toThrow(
      /autorizada/,
    );
    expect(guestPdfRows(data, ["Não irão"])).toEqual([]);
    expect(guestPdfRows(data, ["Padrinho/Madrinha"])).toHaveLength(1);
    expect(guestPdfRows(data, ["Convidado(a) da noiva"])).toHaveLength(1);
    expect(guestPdfRows(data, [])).toEqual([]);
  });
  it("keeps homonyms attached to their own unit and observation; absent family is an em dash", () => {
    const same = {
      ...data,
      guests: data.guests.slice(0, 2).map((g) => ({
        ...g,
        name: "João",
        invitation_id: g.id === "a" ? "missing" : "i",
      })),
    };
    const rows = guestPdfRows(same, ["Todos"]);
    expect(rows.map((r) => r.family)).toEqual(["Família Silva", "—"]);
    expect(rows[1]!.note).toBe(data.guests[1]!.admin_notes);
    const individual = guestPdfRows(
      {
        ...data,
        invitations: data.invitations.map((i) => ({
          ...i,
          kind: "INDIVIDUAL",
        })),
      },
      ["Todos"],
    );
    expect(individual.every((r) => r.family === "—")).toBe(true);
  });
  it("uses the actual generation timestamp in São Paulo even across a UTC date boundary", () => {
    expect(guestPdfTimestamp(date)).toBe("10/11/2026 às 16:56");
    expect(guestPdfTimestamp(new Date("2026-01-01T01:05:00Z"))).toBe(
      "31/12/2025 às 22:05",
    );
  });
  it("creates an empty A4 PDF, exact headings, zero summary and footer", async () => {
    const pages = await readPdf(guestPdf([], date, pdfMonogram));
    expect(pages).toHaveLength(1);
    const page = pages[0]!;
    expect(page.width).toBeCloseTo(595.28, 1);
    expect(page.height).toBeCloseTo(841.89, 1);
    expect(page.text).toContain("Lista de Convidados — Cerimonial");
    expect(page.text).toContain("15 · 12 · 2026");
    expect(page.text).toContain(
      "0 convidados confirmados | 0 Padrinhos | 0 Observações",
    );
    expect(page.text).toContain("Nenhum convidado confirmado até o momento.");
    expect(page.text).toContain("Lista gerada em: 10/11/2026 às 16:56");
    expect(page.text).toContain("Página 1 de 1");
  });
  it("renders accents, serif fonts, long names/families, bold complete notes, and only six safe columns", async () => {
    const rows = guestPdfRows(data, ["Todos"]);
    rows[0] = row(
      "Cláudia & Laís — Nome completo muito longo de uma convidada da família",
      "Observação: íntegra & especial.\nOutra linha com acentuação.",
    );
    rows[1]!.party = false;
    rows[0]!.family = "Família Silva de Albuquerque Cavalcante Pinto Paiva";
    const pages = await readPdf(guestPdf(rows, date, pdfMonogram));
    const text = pages.map((p) => p.text).join(" ");
    for (const s of [
      "Cláudia & Laís",
      "Observação:",
      "íntegra & especial.",
      "Outra linha com acentuação.",
      "Sim",
      "Não",
      "01",
      "02",
    ])
      expect(text).toContain(s);
    expect(text).not.toMatch(
      /WhatsApp|E-mail|Senha|Convite privado|private@example/,
    );
    expect(
      pages[0]!.items.some(
        (i) =>
          i.str.includes("OBSERVAÇÃO:") &&
          i.fontName !==
            pages[0]!.items.find((i) => i.str.includes("Cláudia"))?.fontName,
      ),
    ).toBe(true);
    // The square is drawn as vector geometry rather than a missing font glyph.
    expect(text).not.toContain("�");
  });
  it("paginates 125 guests without clipping, repeats headers/footers and continues very long notes", async () => {
    const long = Array.from(
      { length: 170 },
      (_, i) =>
        `Linha ${String(i).padStart(3, "0")} integral da observação, sem abreviar.`,
    ).join("\n");
    const rows = Array.from({ length: 125 }, (_, i) =>
      row(
        `Convidado ${String(i).padStart(3, "0")}`,
        i === 16 ? long : i % 4 === 0 ? "Observação curta do convidado." : "",
      ),
    );
    const pages = await readPdf(guestPdf(rows, date, pdfMonogram));
    expect(pages.length).toBeGreaterThan(5);
    const text = pages.map((p) => p.text).join(" ");
    for (let i = 0; i < 170; i++)
      expect(text).toContain(`Linha ${String(i).padStart(3, "0")} integral`);
    expect(text).toContain("100");
    expect(text).toContain("125");
    pages.forEach((p, index) => {
      expect(p.text).toContain(
        "Nº Convidado Convidado de Família Padrinho Check-in",
      );
      expect(p.text).toContain(`Página ${index + 1} de ${pages.length}`);
      if (index) {
        expect(p.text).toContain(
          "Felipe & Laís — Lista de Convidados — Cerimonial",
        );
        expect(p.text).not.toContain("125 convidados confirmados");
      }
      for (const item of p.items) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(42);
        expect(item.transform[4] + item.width).toBeLessThan(554);
        expect(item.transform[5]).toBeGreaterThan(25);
      }
    });
  });
  it("moves a normal guest+note together when the pair cannot fit in the remaining page", async () => {
    const rows = Array.from({ length: 36 }, (_, i) =>
      row(`Nome-${i}`, `Observação-${i}: ${"conteúdo ".repeat(32)}`),
    );
    const pages = await readPdf(guestPdf(rows, date, pdfMonogram));
    for (let i = 0; i < rows.length; i++) {
      const ownerPage = pages.findIndex((p) =>
        p.items.some((t) => t.str === `Nome-${i}`),
      );
      const notePage = pages.findIndex((p) =>
        p.text.includes(`Observação-${i}:`),
      );
      expect(ownerPage).toBe(notePage);
    }
  });
});
