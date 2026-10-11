import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { TestPostgres } from "../support/postgres";
test("Real PostgreSQL connections: concurrent individual arrival notifies once; family receipt retry commits once", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    const event = "00000000-0000-4000-8000-000000000001",
      uid = "dddd0009-0000-4000-8000-000000000001";
    db.sql(
      `insert into auth.users(id) values('${uid}');insert into user_roles(event_id,user_id,role) values('${event}','${uid}','ADMIN');`,
    );
    const action = (p_action: string, p_payload: object) =>
      db.rpc(uid, "admin_action", { p_event: event, p_action, p_payload });
    const family = action("INVITATION_SAVE", {
      name: "Concurrent family",
      primary_name: "Primary",
      pin: "0047",
    });
    const primary = db
      .sql(`select primary_guest_id from invitations where id='${family.id}';`)
      .trim();
    const child = action("GUEST_SAVE", {
      name: "Child",
      invitation_id: family.id,
      is_child: true,
    }).id;
    for (const guest of [primary, child])
      db.rpc(uid, "app_mutate", {
        p_event: event,
        p_mutation: randomUUID(),
        p_type: "RSVP_UPDATE",
        p_payload: { guest_id: guest, status: "CONFIRMED" },
      });
    const token = db.rpc(uid, "issue_family_ticket", {
      p_event: event,
      p_invitation: family.id,
    }).token;
    const hash = createHash("sha256").update(token).digest("hex");
    const execute = (type: string, payload: object, mutation = randomUUID()) =>
      new Promise<unknown>((resolve, reject) => {
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
          code === 0
            ? resolve(JSON.parse(output.trim().split("\n")[0]))
            : reject(Error(error)),
        );
        process.stdin.end(
          `begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';select app_mutate('${event}','${mutation}','${type}','${JSON.stringify(payload)}'::jsonb);select pg_sleep(0.2);commit;`,
        );
      });
    await Promise.all([
      execute("CHECKIN_CREATE", { guest_id: child, method: "MANUAL" }),
      execute("CHECKIN_CREATE", { guest_id: child, method: "MANUAL" }),
    ]);
    expect(
      Number(
        db.sql(`select count(*) from checkins where guest_id='${child}';`),
      ),
    ).toBe(1);
    expect(
      Number(
        db.sql(
          `select count(*) from messages where recipient_guest_id='${primary}' and content='Child acabou de confirmar presença';`,
        ),
      ),
    ).toBe(1);
    const mutation = randomUUID(),
      payload = {
        invitation_id: family.id,
        guest_ids: [primary, child],
        token_hash: hash,
      };
    const results = (await Promise.all([
      execute("CHECKIN_FAMILY_CREATE", payload, mutation),
      execute("CHECKIN_FAMILY_CREATE", payload, mutation),
    ])) as { duplicate?: boolean; checkins: unknown[] }[];
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(results[0].checkins).toEqual(results[1].checkins);
    expect(
      Number(
        db.sql(
          `select count(*) from checkins where guest_id in('${child}','${primary}');`,
        ),
      ),
    ).toBe(2);
    expect(
      Number(
        db.sql(
          `select count(*) from mutation_receipts where mutation_id='${mutation}';`,
        ),
      ),
    ).toBe(1);
    expect(
      Number(
        db.sql(
          `select count(*) from messages where recipient_guest_id='${primary}';`,
        ),
      ),
    ).toBe(1);
  } finally {
    db.stop();
  }
});
