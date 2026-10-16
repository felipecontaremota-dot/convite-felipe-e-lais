import { readFileSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start();
    console.log(db.sql(readFileSync("tests/wedding-party.sql", "utf8")));
    console.log(
      db.sql(readFileSync("scripts/wedding-party-postflight.sql", "utf8")),
    );
  } finally {
    db.stop();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
