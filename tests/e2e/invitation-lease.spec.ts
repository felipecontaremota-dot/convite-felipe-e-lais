import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { TestPostgres } from "../support/postgres";
test("two PostgreSQL connections grant only one invitation lease and reject a stale finalizer", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    const event = "00000000-0000-4000-8000-000000000001",
      uid = "cdcdcdcd-0000-4000-8000-000000000001";
    db.sql(
      `insert into auth.users(id) values('${uid}');insert into user_roles(event_id,user_id,role) values('${event}','${uid}','ADMIN');`,
    );
    const guest = db.rpc(uid, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Concurrent lease", email: "lease@example.test" },
    }).id;
    const row = JSON.parse(
      db.sql(
        `select prepare_invitation_delivery('${event}','cdcdcdcd-1000-4000-8000-000000000001','${guest}');`,
      ),
    );
    const execute = () =>
      new Promise<string>((resolve, reject) => {
        const args = db.ci
          ? [
              "-u",
              "postgres",
              "psql",
              "-d",
              db.name,
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ]
          : [
              "exec",
              "-i",
              db.name,
              "psql",
              "-h",
              "127.0.0.1",
              "-U",
              "postgres",
              "-qAt",
              "-v",
              "ON_ERROR_STOP=1",
            ];
        const process = spawn(db.ci ? "sudo" : "docker", args);
        let output = "",
          error = "";
        process.stdout.on("data", (d) => {
          output += d;
        });
        process.stderr.on("data", (d) => {
          error += d;
        });
        process.on("error", reject);
        process.on("close", (code) =>
          code === 0 ? resolve(output) : reject(new Error(error)),
        );
        process.stdin.end(
          `begin;select claim_invitation_delivery('${row.id}',repeat('a',64));select pg_sleep(0.2);commit;`,
        );
      });
    const results = (await Promise.all([execute(), execute()])).map((s) =>
      JSON.parse(s.trim().split("\n")[0]),
    );
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.filter((r) => r.reason === "processing")).toHaveLength(1);
    expect(
      JSON.parse(
        db.sql(
          `select jsonb_build_object('attempts',attempts,'status',status,'sent_at',sent_at) from invitation_deliveries where id='${row.id}';`,
        ),
      ),
    ).toEqual({ attempts: 1, status: "pending", sent_at: null });
    const first = results.find((r) => r.claimed)!;
    db.sql(
      `update invitation_deliveries set locked_at=now()-interval '3 minutes' where id='${row.id}';`,
    );
    const next = JSON.parse(
      db.sql(`select claim_invitation_delivery('${row.id}',repeat('a',64));`),
    );
    expect(next.claimed).toBe(true);
    expect(next.token).not.toBe(first.token);
    expect(
      db
        .sql(
          `select finish_invitation_delivery('${row.id}','sent','resend','late',null,'${first.token}');`,
        )
        .trim(),
    ).toBe("f");
    expect(
      db
        .sql(
          `select finish_invitation_delivery('${row.id}','pending','resend',null,'uncertain','${next.token}');`,
        )
        .trim(),
    ).toBe("t");
  } finally {
    db.stop();
  }
});
