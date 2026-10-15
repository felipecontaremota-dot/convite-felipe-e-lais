import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const original = readFileSync(
  "supabase/migrations/20261014171048_messaging_conversations.sql",
  "utf8",
);
const installer = readFileSync("scripts/messaging-prod/install.sql", "utf8");
const payload = (sql: string) =>
  sql.slice(
    sql.indexOf("-- Incremental extension."),
    sql.lastIndexOf("commit;"),
  );
describe("manual production messaging compatibility", () => {
  it("installs the entire original payload, preserving scheduling/admission dependencies", () => {
    expect(payload(installer)).toBe(payload(original));
    expect(
      readFileSync("scripts/messaging-prod/payload.sha256", "utf8"),
    ).toContain(createHash("sha256").update(payload(original)).digest("hex"));
  });
  it("repeats a real baseline gate inside the transaction and refuses partial/repeated installs", () => {
    expect(installer.indexOf("DO $preflight$")).toBeLessThan(
      installer.indexOf("-- Incremental extension."),
    );
    expect(installer).toContain("unreviewed baseline function");
    expect(installer).toContain("partial installation or name collision");
    expect(installer).not.toContain("messaging requires current main name/PIN");
    expect(installer).not.toContain("insert into supabase_migrations");
  });
  it("uses identical verification gates for postflight, registration and safe disable", () => {
    const gate = (file: string) => {
      const sql = readFileSync(`scripts/messaging-prod/${file}`, "utf8");
      return sql.slice(
        sql.indexOf("DO $verify$"),
        sql.indexOf("END $verify$;") + "END $verify$;".length,
      );
    };
    expect(gate("register-equivalent.sql")).toBe(gate("verify-readonly.sql"));
    expect(gate("disable-new-actions.sql")).toBe(gate("verify-readonly.sql"));
    const pre = (file: string) => {
      const sql = readFileSync(`scripts/messaging-prod/${file}`, "utf8");
      return sql.slice(
        sql.indexOf("DO $preflight$"),
        sql.indexOf("END $preflight$;") + "END $preflight$;".length,
      );
    };
    expect(pre("install.sql")).toBe(pre("preflight-readonly.sql"));
  });
});
