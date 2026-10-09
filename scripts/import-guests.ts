import { readFile, writeFile } from "node:fs/promises";
import { importReport } from "../src/utils/sheets";
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw Error(
      "Uso: npm run import:report -- entrada.json /caminho/privado/relatorio.json",
    );
  const rows = JSON.parse(await readFile(input, "utf8"));
  if (!Array.isArray(rows))
    throw Error("O arquivo deve conter uma lista de linhas normalizadas.");
  const report = importReport(rows);
  await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      rows: report.length,
      invalid: report.filter((r) => !r.valid).length,
      duplicates: report.filter((r) => r.duplicate).length,
      applied: 0,
    }),
  );
}
void main().catch(() => {
  console.error(
    "Falha ao gerar relatório. Verifique o arquivo, os dados e um caminho de saída ainda não existente.",
  );
  process.exitCode = 1;
});
