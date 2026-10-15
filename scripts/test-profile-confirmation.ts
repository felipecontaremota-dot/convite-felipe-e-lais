// Disposable upgrade regression. Never connects to a remote database.
import { readFileSync } from "node:fs";
import { TestPostgres } from "../tests/support/postgres";
async function main() {
  const db = new TestPostgres();
  try {
    await db.start("pre-confirmation");
    for (const path of [
      "tests/profile-confirmation-upgrade.sql",
      "scripts/profile-confirmation-preflight.sql",
      "supabase/migrations/20261015033043_profile_confirmation.sql",
      "tests/profile-confirmation-upgrade-verify.sql",
      "scripts/profile-confirmation-postflight.sql",
      "scripts/profile-confirmation-register.sql",
      "scripts/profile-confirmation-register.sql",
      "tests/profile-confirmation.sql",
    ])
      db.sql(readFileSync(path, "utf8"));
    console.log(
      "Profile confirmation upgrade passed: existing sessions, public/auth OIDs, no automatic confirmations, ledger idempotency and authenticated matrix.",
    );
  } finally {
    db.stop();
  }
}
void main().catch(() => {
  console.error(
    "Profile confirmation isolated upgrade failed. No remote database was accessed.",
  );
  process.exitCode = 1;
});
