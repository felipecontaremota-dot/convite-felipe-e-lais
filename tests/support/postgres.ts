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
  async start() {
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
      for (const file of readdirSync("supabase/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort())
        this.sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
      this.sql(readFileSync("supabase/seed.sql", "utf8"));
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
      issue_ticket: `issue_ticket(${event},${literal(args.p_guest)}::uuid,${args.p_regenerate === true})`,
      event_role: `event_role(${event})`,
      app_snapshot: `app_snapshot(${event})`,
      admin_action: `admin_action(${event},${literal(args.p_action)},${literal(JSON.stringify(args.p_payload))}::jsonb)`,
      app_mutate: `app_mutate(${event},${literal(args.p_mutation)}::uuid,${literal(args.p_type)},${literal(JSON.stringify(args.p_payload))}::jsonb)`,
    };
    if (!expressions[fn]) throw Error("Unsupported test RPC");
    return JSON.parse(
      this.sql(
        `begin; set local role authenticated; set local request.jwt.claim.sub=${literal(user)}; select to_jsonb(${expressions[fn]}); commit;`,
      ).trim(),
    );
  }
}
