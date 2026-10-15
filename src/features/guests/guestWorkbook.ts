import writeExcelFile, {
  type Cell,
  type Feature,
  type SheetData,
} from "write-excel-file/universal";
import {
  getOrderOfSiblings,
  insertElementMarkupAccordingToOrderOfSiblings,
} from "write-excel-file/utility";
import { colors } from "../../theme/palette";
import {
  exportDate,
  guestExportHeaders,
  type GuestExportRow,
} from "./guestExport";
// Explicit String cells never become formulas or hyperlinks, even when beginning with =,+,-,@.
// Strip XML-illegal controls; preserve phone digits, accents and leading zeros verbatim.
export const excelText = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .slice(0, 32767);
const columnWidths = [7, 42, 38, 29, 23, 38, 19, 18];
export async function guestWorkbook(
  rows: GuestExportRow[],
  generatedAt: Date,
): Promise<Blob> {
  if (!rows.length) throw Error("Nenhum convidado encontrado para exportação.");
  const heading = (value: string, size = 11): Cell[] => [
    {
      value,
      type: String,
      columnSpan: 8,
      fontWeight: "bold",
      fontSize: size,
      textColor: colors.ink,
      height: 26,
    },
    ...Array(7).fill(null),
  ];
  const data: SheetData = [
    heading("Felipe & Laís — Lista de Convidados", 18),
    heading("Casamento: 15 de dezembro de 2026"),
    heading(`Gerado em: ${exportDate(generatedAt)}`),
    [],
    guestExportHeaders.map((value) => ({
      value,
      type: String,
      fontWeight: "bold",
      backgroundColor: colors.ink,
      textColor: colors.card,
      wrap: true,
      height: 32,
    })),
    ...rows.map((row, n) =>
      row.map((value, column): Cell => ({
        value: typeof value === "string" ? excelText(value) : value,
        type: typeof value === "string" ? String : Number,
        format: column === 4 ? "@" : undefined,
        wrap: true,
        height: Math.min(
          409,
          Math.max(
            30,
            12 +
              16 *
                Math.max(
                  ...row.map((v, c) =>
                    String(v)
                      .split("\n")
                      .reduce(
                        (lines, part) =>
                          lines +
                          Math.max(
                            1,
                            Math.ceil(
                              part.length / ((columnWidths[c] || 38) - 4),
                            ),
                          ),
                        0,
                      ),
                  ),
                ),
          ),
        ),
        alignVertical: "center",
        backgroundColor: n % 2 ? colors.wash : colors.card,
        borderColor: colors.line,
        borderStyle: "thin",
        textColor: colors.ink,
      })),
    ),
  ];
  // Supported feature API inserts autoFilter in OOXML order, before mergeCells/pageMargins.
  const autoFilter: Feature<Blob> = {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml) =>
            insertElementMarkupAccordingToOrderOfSiblings(
              xml,
              `<autoFilter ref="A5:H${rows.length + 5}"/>`,
              getOrderOfSiblings("xl/worksheets/sheet{id}.xml", "worksheet")!,
              "worksheet",
            ),
        },
      },
    },
  };
  return writeExcelFile(
    data,
    {
      sheet: "Convidados",
      stickyRowsCount: 5,
      showGridLines: false,
      orientation: "landscape",
      columns: columnWidths.map((width) => ({ width })),
    },
    { fontFamily: "Calibri", fontSize: 11, features: [autoFilter] },
  ).toBlob();
}
export function downloadGuestWorkbook(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
}
