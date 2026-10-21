// Isolated PostgreSQL upgrade and integration tests. Never connects to production.
import { readFileSync, readdirSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-admin-guest");
    db.sql(readFileSync("tests/admin-guest-prepare.sql", "utf8"));
    const migration = readdirSync("supabase/migrations").find((f) =>
      f.endsWith("_admin_guest_rsvp_sending.sql"),
    );
    if (!migration) throw Error("Missing migration");
    db.sql(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    console.log(db.sql(readFileSync("tests/admin-guest-verify.sql", "utf8")));
    for (const file of [
      "tests/profile-confirmation.sql",
      "tests/link-responsible-identity.sql",
      "tests/messaging-conversations.sql",
      "tests/wedding-party.sql",
    ]) {
      db.sql(readFileSync(file, "utf8"));
    }
    console.log(
      "Final wrappers preserve profile confirmation, family link identity, messaging and wedding party matrices.",
    );
  } finally {
    db.stop();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
