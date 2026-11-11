import { jsPDF } from "jspdf";
import { colors } from "../../theme/palette";
import { guestPdfFonts } from "./guestPdfFonts.generated";
import {
  guestPdfSummary,
  guestPdfTimestamp,
  type GuestPdfRow,
} from "./guestPdfData";

const columns = [9, 62, 25, 47, 22, 15];
const headers = [
  "Nº",
  "Convidado",
  "Convidado de",
  "Família",
  "Padrinho",
  "Check-in",
];
const left = 15,
  width = 180,
  bottom = 276,
  line = 4.2,
  padding = 2.2;
const title = "Lista de Convidados — Cerimonial";

// Millimetre-based A4 layout, independent of viewport/browser installed fonts.
// Separate from the Excel rows/writer; credentials never reach this renderer.
export function guestPdf(
  rows: GuestPdfRow[],
  generatedAt: Date,
  monogram: Uint8Array,
): Blob {
  const doc = new jsPDF({
    orientation: "portrait",
    format: "a4",
    putOnlyUsedFonts: true,
    compress: true,
  });
  doc.addFileToVFS("P052-Roman.ttf", guestPdfFonts.roman);
  doc.addFont("P052-Roman.ttf", "P052", "normal");
  doc.addFileToVFS("P052-Bold.ttf", guestPdfFonts.bold);
  doc.addFont("P052-Bold.ttf", "P052", "bold");
  doc.setProperties({
    title: `Felipe & Laís — ${title}`,
    author: "Felipe & Laís",
    creator: "Convite Felipe & Laís",
  });
  const font = (bold = false, size = 8.5) => {
    doc.setFont("P052", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(colors.ink);
  };
  const center = (text: string, y: number, size: number, bold = false) => {
    font(bold, size);
    doc.text(text, 105, y, { align: "center" });
  };
  const wrap = (text: string, maxWidth: number): string[] =>
    doc.splitTextToSize(text.replace(/\r\n?/g, "\n"), maxWidth);
  const drawLines = (
    lines: string[],
    x: number,
    top: number,
    align: "left" | "center" = "left",
  ) =>
    lines.forEach((text, index) =>
      doc.text(text, x, top + index * line, { align }),
    );
  const tableHeader = (top: number) => {
    doc.setFillColor(colors.line);
    doc.rect(left, top, width, 9, "F");
    font(true, 8.5);
    let x = left;
    headers.forEach((text, index) => {
      const centered = [0, 4, 5].includes(index);
      doc.text(
        text,
        x + (centered ? columns[index]! / 2 : padding),
        top + 5.8,
        { align: centered ? "center" : "left" },
      );
      x += columns[index]!;
    });
    return top + 9;
  };
  const nextPage = () => {
    doc.addPage();
    center(`Felipe & Laís — ${title}`, 16, 10.5, true);
    center("15 · 12 · 2026", 22, 9);
    return tableHeader(28);
  };
  const image = doc.getImageProperties(monogram);
  if (image.fileType !== "PNG" || !(image.width > 0 && image.height > 0))
    throw Error("Monograma inválido.");
  const imageWidth = 26;
  const imageHeight = (imageWidth * image.height) / image.width;
  doc.addImage(
    monogram,
    "PNG",
    105 - imageWidth / 2,
    12,
    imageWidth,
    imageHeight,
    "monogram",
    "FAST",
  );
  const headingBottom = 12 + imageHeight;
  center("Felipe & Laís", headingBottom + 9, 22);
  center("15 · 12 · 2026", headingBottom + 15, 10.5);
  center(title, headingBottom + 26, 15, true);
  const counts = guestPdfSummary(rows);
  doc.setFillColor(colors.wash);
  doc.roundedRect(left, headingBottom + 32, width, 12, 2, 2, "F");
  center(
    `${counts.confirmed} convidados confirmados  |  ${counts.party} Padrinhos  |  ${counts.notes} Observações`,
    headingBottom + 39.5,
    9.5,
  );
  let y = tableHeader(headingBottom + 50);
  if (!rows.length)
    center("Nenhum convidado confirmado até o momento.", y + 13, 11);
  rows.forEach((row, index) => {
    font();
    const values = [
      String(index + 1).padStart(2, "0"),
      row.name,
      row.side,
      row.family,
      row.party ? "Sim" : "Não",
      "",
    ];
    const lines = values.map((value, column) =>
      wrap(value, columns[column]! - padding * 2),
    );
    const height =
      Math.max(1, ...lines.map((text) => text.length)) * line + padding * 2;
    font(true);
    const note = row.note.trim()
      ? wrap(`OBSERVAÇÃO: ${row.note}`, width - padding * 2)
      : [];
    const noteHeight = note.length ? note.length * line + padding * 2 : 0;
    const fullPageHeight = bottom - 37;
    // Keep a whole guest + note together when it can fit on a fresh page.
    // An exceptionally long note starts with its owner, then continues safely.
    const required =
      height +
      (height + noteHeight <= fullPageHeight
        ? noteHeight
        : note.length
          ? line + padding * 2
          : 0);
    if (y + required > bottom) y = nextPage();
    font();
    let x = left;
    lines.forEach((text, column) => {
      const centered = [0, 4, 5].includes(column);
      drawLines(
        text,
        x + (centered ? columns[column]! / 2 : padding),
        y + padding + 2.8 + (height - padding * 2 - text.length * line) / 2,
        centered ? "center" : "left",
      );
      if (column === 5) {
        // Vector checkbox: always empty, never derived from digital check-in.
        doc.setDrawColor(colors.ink);
        doc.setLineWidth(0.22);
        doc.rect(
          x + columns[column]! / 2 - 1.55,
          y + height / 2 - 1.55,
          3.1,
          3.1,
        );
      }
      x += columns[column]!;
    });
    y += height;
    doc.setDrawColor(colors.line);
    doc.setLineWidth(0.15);
    doc.line(left, y, left + width, y);
    let offset = 0;
    while (offset < note.length) {
      let capacity = Math.floor((bottom - y - padding * 2) / line);
      if (capacity < 1) {
        y = nextPage();
        capacity = Math.floor((bottom - y - padding * 2) / line);
      }
      const chunk = note.slice(offset, offset + capacity);
      const h = chunk.length * line + padding * 2;
      doc.setFillColor(colors.paper);
      doc.rect(left, y, width, h, "F");
      font(true);
      drawLines(chunk, left + padding, y + padding + 2.8);
      y += h;
      offset += chunk.length;
      if (offset < note.length) y = nextPage();
    }
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(colors.line);
    doc.setLineWidth(0.15);
    doc.line(left, 281, left + width, 281);
    font(false, 7.5);
    doc.setTextColor(colors.muted);
    doc.text(`Lista gerada em: ${guestPdfTimestamp(generatedAt)}`, left, 286);
    doc.text(`Página ${page} de ${pages}`, left + width, 286, {
      align: "right",
    });
  }
  return doc.output("blob");
}
