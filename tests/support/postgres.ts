// Disposable PostgreSQL bridge for browser regression tests. Never connects to production.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
export class TestPostgres {
  name = `wedding_browser_${randomUUID().replaceAll("-", "")}`;
  ci = process.env.GITHUB_ACTIONS === "true";
  created = false;
  run(command: string, args: string[], input?: string) {
    return execFileSync(command, args, {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  sql(source: string) {
    return this.ci
      ? this.run(
          "sudo",
          [
            "-u",
            "postgres",
            "psql",
            "-d",
            this.name,
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          source,
        )
      : this.run(
          "docker",
          [
            "exec",
            "-i",
            this.name,
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          source,
        );
  }
  async start(
    baseline:
      | "main"
      | "prod-profile"
      | "pre-confirmation"
      | "pre-admin-guest"
      | "pre-party-content"
      | "pre-ticket-replacement"
      | "pre-checkin-actor-role"
      | "pre-checkin-reversal" = "main",
  ) {
    if (this.ci) {
      this.run("sudo", ["systemctl", "start", "postgresql.service"]);
      this.run("sudo", ["-u", "postgres", "createdb", this.name]);
    } else {
      this.run("docker", [
        "run",
        "--name",
        this.name,
        "-e",
        "POSTGRES_PASSWORD=isolated-test-only",
        "-d",
        "postgres:17-alpine",
      ]);
    }
    this.created = true;
    try {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try {
          this.sql("select 1;");
          ready = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!ready) throw Error("Disposable PostgreSQL did not become ready");
      // CI roles may already exist from test:db; all schemas/data remain in this exclusive database.
      const bootstrap = readFileSync("tests/db-bootstrap.sql", "utf8").replace(
        /create role (\w+) ([^;]+);/g,
        (_, role, attributes) =>
          `DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} ${attributes}; END IF; END$$;`,
      );
      this.sql(bootstrap);
      const migrations = readdirSync("supabase/migrations");
      const adminGuestCutoff = migrations.find((f) =>
        f.endsWith("_admin_guest_rsvp_sending.sql"),
      );
      if (baseline === "pre-admin-guest" && !adminGuestCutoff)
        throw Error("Missing admin guest migration");
      for (const file of migrations
        .filter(
          (f) =>
            f.endsWith(".sql") &&
            (baseline === "main" ||
              (baseline === "pre-party-content"
                ? f < "20261024215704"
                : baseline === "pre-ticket-replacement"
                  ? f < "20261024052358"
                  : baseline === "pre-checkin-actor-role"
                    ? f < "20261024004410"
                    : baseline === "pre-checkin-reversal"
                      ? f < "20261023115359"
                      : baseline === "pre-admin-guest"
                        ? f < adminGuestCutoff!
                        : baseline === "prod-profile"
                          ? f < "20261013204105"
                          : f < "20261015033043")),
        )
        .sort())
        this.sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
      this.sql(readFileSync("supabase/seed.sql", "utf8"));
      if (baseline === "prod-profile") {
        this.sql(
          "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);",
        );
        this.sql(readFileSync("scripts/messaging-prod/install.sql", "utf8"));
        this.sql(
          readFileSync("scripts/messaging-prod/verify-readonly.sql", "utf8"),
        );
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop() {
    if (!this.created) return;
    if (this.ci)
      this.run("sudo", ["-u", "postgres", "dropdb", "--if-exists", this.name]);
    else this.run("docker", ["rm", "-f", this.name]);
    this.created = false;
  }
  rpc(user: string, fn: string, args: Record<string, unknown>) {
    const literal = (value: unknown) =>
      `'${String(value).replaceAll("'", "''")}'`;
    const event = `${literal(args.p_event)}::uuid`;
    const expressions: Record<string, string> = {
      event_role: `event_role(${event})`,
      wedding_party_admin_save_content: `wedding_party_admin_save_content(${event},${literal(args.p_guest)}::uuid,${literal(args.p_role)},${args.p_expected_cycle == null ? "null" : literal(args.p_expected_cycle)}::uuid,${literal(args.p_message)},${args.p_expected_message == null ? "null" : literal(args.p_expected_message)},${args.p_display_name == null ? "null" : literal(args.p_display_name)},${args.p_expected_display_name == null ? "null" : literal(args.p_expected_display_name)},${args.p_note == null ? "null" : literal(args.p_note)},${args.p_expected_note == null ? "null" : literal(args.p_expected_note)})`,
      wedding_party_admin_save_details: `wedding_party_admin_save_details(${event},${literal(args.p_guest)}::uuid,${literal(args.p_role)},${args.p_expected_cycle == null ? "null" : literal(args.p_expected_cycle)}::uuid,${literal(args.p_message)},${args.p_expected_message == null ? "null" : literal(args.p_expected_message)},${args.p_display_name == null ? "null" : literal(args.p_display_name)},${args.p_expected_display_name == null ? "null" : literal(args.p_expected_display_name)})`,
      wedding_party_admin_save: `wedding_party_admin_save(${event},${literal(args.p_guest)}::uuid,${literal(args.p_role)},${args.p_expected_cycle == null ? "null" : literal(args.p_expected_cycle)}::uuid,${literal(args.p_message)},${args.p_expected_message == null ? "null" : literal(args.p_expected_message)})`,
      wedding_party_state: `wedding_party_state(${event})`,
      wedding_party_admin_get: `wedding_party_admin_get(${event},${literal(args.p_guest)}::uuid)`,
      wedding_party_admin_set: `wedding_party_admin_set(${event},${literal(args.p_guest)}::uuid,${args.p_role == null ? "null" : literal(args.p_role)},${args.p_expected_cycle == null ? "null" : literal(args.p_expected_cycle)}::uuid)`,
      wedding_party_respond: `wedding_party_respond(${event},${literal(args.p_cycle)}::uuid,${literal(args.p_action)})`,
      replace_ticket: `replace_ticket(${event},${literal(args.p_guest)}::uuid,${args.p_expected_credential == null ? "null" : literal(args.p_expected_credential)}::uuid)`,
      issue_ticket: `issue_ticket(${event},${literal(args.p_guest)}::uuid,${args.p_regenerate === true})`,
      app_snapshot: `app_snapshot(${event})`,
      admin_action: `admin_action(${event},${literal(args.p_action)},${literal(JSON.stringify(args.p_payload))}::jsonb)`,
      app_mutate: `app_mutate(${event},${literal(args.p_mutation)}::uuid,${literal(args.p_type)},${literal(JSON.stringify(args.p_payload))}::jsonb)`,
    };
    if (!expressions[fn]) throw Error("Unsupported test RPC");
    return JSON.parse(
      this.sql(
        `begin; set local role authenticated; set local request.jwt.claim.sub=${literal(user)}; select to_jsonb(${expressions[fn]}); commit;`,
      ).trim() || "null",
    );
  }
}
