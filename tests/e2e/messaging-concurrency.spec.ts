import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { TestPostgres } from "../support/postgres";
const event = "00000000-0000-4000-8000-000000000001",
  admin = "cacacaca-0000-4000-8000-000000000001",
  device = "cacacaca-0000-4000-8000-000000000002",
  device2 = "cacacaca-0000-4000-8000-000000000003";
function execute(db: TestPostgres, sql: string) {
  return new Promise<string>((resolve, reject) => {
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
    const child = spawn(db.ci ? "sudo" : "docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      error = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(Error(error)),
    );
    child.stdin.end(sql);
  });
}
const auth = (user: string, sql: string) =>
  `begin;set local role authenticated;set local request.jwt.claim.sub='${user}';${sql};select pg_sleep(0.15);commit;`;
const json = (s: string) =>
  JSON.parse(s.split("\n").find((line) => line.startsWith("{"))!);
test("messaging SQL security matrix on a clean database", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    expect(
      db.sql(readFileSync("tests/messaging-conversations.sql", "utf8")),
    ).toContain("Messaging security");
  } finally {
    db.stop();
  }
});
test("concurrent sends, replies, shared reads and scheduling remain unique", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    db.sql(
      `update events set notification_scheduling_enabled=true where id='${event}';insert into auth.users(id) values('${admin}'),('${device}'),('${device2}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
    );
    const unit = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Concurrent chat unit" },
    });
    db.sql(
      `insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('${event}','${device}','${unit.invitation_id}',now()),('${event}','${device2}','${unit.invitation_id}',now());`,
    );
    const send = auth(
      device,
      `select app_mutate('${event}','cacacaca-1000-4000-8000-000000000001','MESSAGE_SEND','{"content":"Concurrent inbound"}')`,
    );
    const sent = await Promise.all([execute(db, send), execute(db, send)]);
    const inbound = json(sent[0]).id;
    expect(json(sent[1]).id).toBe(inbound);
    expect(
      db
        .sql(
          "select count(*) from messages where content='Concurrent inbound';",
        )
        .trim(),
    ).toBe("1");
    const reply = auth(
      admin,
      `select app_mutate('${event}','cacacaca-1000-4000-8000-000000000002','MESSAGE_REPLY','{"message_id":"${inbound}","content":"Concurrent reply","channels":["IN_APP","EMAIL"]}')`,
    );
    const answers = await Promise.all([execute(db, reply), execute(db, reply)]);
    const answer = json(answers[0]).id;
    expect(json(answers[1]).id).toBe(answer);
    expect(
      db
        .sql(
          `select count(*) from notification_jobs where message_id='${answer}';`,
        )
        .trim(),
    ).toBe("2");
    await Promise.all([
      execute(
        db,
        auth(
          device,
          `select app_mutate('${event}','cacacaca-1000-4000-8000-000000000003','MESSAGE_READ','{"id":"${answer}"}')`,
        ),
      ),
      execute(
        db,
        auth(
          device2,
          `select app_mutate('${event}','cacacaca-1000-4000-8000-000000000004','MESSAGE_READ','{"id":"${answer}"}')`,
        ),
      ),
    ]);
    expect(
      db
        .sql(`select count(*) from message_reads where message_id='${answer}';`)
        .trim(),
    ).toBe("1");
    const sid = "cacacaca-2000-4000-8000-000000000001",
      due = new Date(Date.now() + 3600000).toISOString();
    const payload = {
      id: sid,
      title: "Concurrent schedule",
      body: "One materialization",
      scheduled_at: due,
      audience: "INDIVIDUAL",
      recipient_guest_ids: [unit.id],
      channels: ["IN_APP", "EMAIL"],
      active: true,
    };
    const schedule = auth(
      admin,
      `select admin_action('${event}','NOTIFICATION_SAVE','${JSON.stringify(payload)}'::jsonb)`,
    );
    await Promise.all([execute(db, schedule), execute(db, schedule)]);
    expect(
      db
        .sql(`select count(*) from notification_schedules where id='${sid}';`)
        .trim(),
    ).toBe("1");
    db.sql(
      `update notification_schedules set scheduled_at=now()-interval '1 second' where id='${sid}';`,
    );
    const work =
      "begin;set local role service_role;select schedule_notifications();select pg_sleep(0.15);commit;";
    await Promise.all([execute(db, work), execute(db, work)]);
    expect(
      db.sql(`select count(*) from messages where id='${sid}';`).trim(),
    ).toBe("1");
    expect(
      db
        .sql(
          `select count(*) from notification_jobs where message_id='${sid}';`,
        )
        .trim(),
    ).toBe("2");
    // Even hostile reuse of a client UUID across events cannot overwrite the winner.
    const otherEvent = "cacacaca-9000-4000-8000-000000000001";
    db.sql(
      `insert into events(id,title,starts_at,notification_scheduling_enabled) values('${otherEvent}','Other event',now()+interval '1 month',true);insert into user_roles(event_id,user_id,role) values('${otherEvent}','${admin}','ADMIN');`,
    );
    const otherUnit = db.rpc(admin, "admin_action", {
      p_event: otherEvent,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Other event unit" },
    });
    const sharedId = "cacacaca-2000-4000-8000-000000000002";
    const contenders = [event, otherEvent].map((ev, index) =>
      execute(
        db,
        auth(
          admin,
          `select admin_action('${ev}','NOTIFICATION_SAVE','${JSON.stringify({ ...payload, id: sharedId, title: index ? "Other event schedule" : "Original event schedule", recipient_guest_ids: [index ? otherUnit.id : unit.id] })}'::jsonb)`,
        ),
      ),
    );
    const collision = await Promise.allSettled(contenders);
    expect(collision.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(collision.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      db
        .sql(
          `select count(*) from notification_schedules where id='${sharedId}';`,
        )
        .trim(),
    ).toBe("1");
    expect(
      db
        .sql(
          `select version from notification_schedules where id='${sharedId}';`,
        )
        .trim(),
    ).toBe("1");
  } finally {
    db.stop();
  }
});
