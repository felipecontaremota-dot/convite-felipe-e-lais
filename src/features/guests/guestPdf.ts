import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { colors } from "../../theme/palette";
import {
  exportDate,
  guestExportHeaders,
  type GuestExportRow,
} from "./guestExport";

export function guestPdf(rows: GuestExportRow[], generatedAt: Date): Blob {
  if (!rows.length) throw Error("Nenhum convidado encontrado para exportação.");
  const doc = new jsPDF({ orientation: "landscape", format: "a3" });
  doc.setTextColor(colors.ink);
  doc.setFontSize(18);
  doc.text("Felipe & Laís — Lista de Convidados", 14, 16);
  doc.setFontSize(10);
  doc.text(
    `Casamento: 15 de dezembro de 2026 | Gerado em: ${exportDate(generatedAt)}`,
    14,
    24,
  );
  autoTable(doc, {
    startY: 30,
    head: [guestExportHeaders],
    body: rows.map((row) => row.map(String)),
    styles: {
      fontSize: 8,
      overflow: "linebreak",
      textColor: colors.ink,
      lineColor: colors.line,
    },
    headStyles: { fillColor: colors.ink, textColor: colors.card },
    alternateRowStyles: { fillColor: colors.wash },
    columnStyles: { 4: { cellWidth: 85 }, 5: { cellWidth: 17 } },
  });
  return doc.output("blob");
}
