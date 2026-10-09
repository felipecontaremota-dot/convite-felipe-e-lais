import { z } from "zod";
export const sheetMapping = {
  id: "Convidado ID",
  name: "Nome completo",
  family: "Família/Convite",
  group: "Grupo/vínculo",
  rsvp: "RSVP",
  checkin: "Check-in",
  entered: "Horário de entrada",
  dietary: "Restrição alimentar",
  contact: "Contato",
  note: "Observações",
};
export const sheetRow = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  family: z.string().trim().min(1),
  group: z.string().default(""),
  rsvp: z.enum(["PENDING", "CONFIRMED", "DECLINED"]).default("PENDING"),
});
export function importReport(rows: unknown[], existingNames: string[] = []) {
  const seen = new Set(
    existingNames.map((x) => x.trim().toLocaleLowerCase("pt-BR")),
  );
  return rows.map((row, index) => {
    const parsed = sheetRow.safeParse(row);
    if (!parsed.success)
      return {
        row: index + 2,
        valid: false,
        duplicate: false,
        errors: parsed.error.issues.map((x) => x.message),
      };
    const key = parsed.data.name.toLocaleLowerCase("pt-BR");
    const duplicate = seen.has(key);
    seen.add(key);
    return { row: index + 2, valid: true, duplicate, data: parsed.data };
  });
}
