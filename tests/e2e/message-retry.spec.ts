import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { dispatchCommittedMessage } from "../../src/features/messages/recipients";
import { TestPostgres } from "../support/postgres";
const event = "00000000-0000-4000-8000-000000000001";
const admin = "dededede-0000-4000-8000-000000000001";
test("concurrent committed-message retries preserve one ID, recipients, jobs and Home announcement", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    db.sql(
      `insert into auth.users(id) values('${admin}'); insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
    );
    const guest = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Concurrent recipient" },
    }).id;
    const mutation = "dededede-1000-4000-8000-000000000001";
    const sql = `begin;set local role authenticated;set local request.jwt.claim.sub='${admin}';select app_mutate('${event}','${mutation}','MESSAGE_SEND_TO_GUESTS','{"content":"Concurrent notice","recipient_guest_ids":["${guest}"],"channels":["IN_APP","EMAIL"],"create_announcement":true}');select pg_sleep(0.2);commit;`;
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
        const child = spawn(db.ci ? "sudo" : "docker", args);
        let output = "",
          error = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.on("data", (data) => {
          error += data;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 ? resolve(output) : reject(new Error(error)),
        );
        child.stdin.end(sql);
      });
    const responses = (await Promise.all([execute(), execute()])).map(
      (output) => JSON.parse(output.trim().split("\n")[0]),
    );
    expect(responses[0].id).toBe(responses[1].id);
    expect(responses.filter((r) => r.duplicate === true)).toHaveLength(1);
    expect(responses.every((r) => r.ok === true)).toBe(true);
    const mid = responses[0].id;
    expect(
      JSON.parse(
        db.sql(
          `select jsonb_build_object('messages',(select count(*) from messages),'recipients',(select count(*) from message_recipients),'jobs',(select count(*) from notification_jobs),'announcements',(select count(*) from announcements),'receipt',(select result->>'id' from mutation_receipts where mutation_id='${mutation}'));`,
        ),
      ),
    ).toEqual({
      messages: 1,
      recipients: 1,
      jobs: 2,
      announcements: 1,
      receipt: mid,
    });
    const unrelated = db.rpc(admin, "app_mutate", {
      p_event: event,
      p_mutation: "dededede-1000-4000-8000-000000000002",
      p_type: "MESSAGE_SEND_TO_GUESTS",
      p_payload: {
        content: "Unrelated message",
        recipient_guest_ids: [guest],
        channels: ["EMAIL"],
      },
    }).id;
    db.sql(`update invitations set active=false;`);
    const retry = db.rpc(admin, "app_mutate", {
      p_event: event,
      p_mutation: mutation,
      p_type: "MESSAGE_SEND_TO_GUESTS",
      p_payload: { content: "Changed", recipient_guest_ids: [] },
    });
    expect(retry).toEqual({ ok: true, duplicate: true, id: mid });
    const dispatched: string[] = [];
    await dispatchCommittedMessage(
      retry,
      ["IN_APP", "EMAIL"],
      async (_channels, id) => {
        dispatched.push(id);
        const jobs = JSON.parse(
          db.sql(
            `begin;set local role service_role;select coalesce(jsonb_agg(to_jsonb(j)),'[]') from claim_event_notifications('${event}',50,'${id}') j;commit;`,
          ),
        );
        expect(jobs).toHaveLength(2);
        expect(
          jobs.every((j: { message_id: string }) => j.message_id === mid),
        ).toBe(true);
        return "processed";
      },
    );
    expect(dispatched).toEqual([mid]);
    expect(
      JSON.parse(
        db.sql(
          `select jsonb_build_object('original_messages',(select count(*) from messages where id='${mid}'),'original_recipients',(select count(*) from message_recipients where message_id='${mid}'),'original_jobs',(select count(*) from notification_jobs where message_id='${mid}'),'unrelated_pending',(select count(*) from notification_jobs where message_id='${unrelated}' and status='pending'),'announcements',(select count(*) from announcements));`,
        ),
      ),
    ).toEqual({
      original_messages: 1,
      original_recipients: 1,
      original_jobs: 2,
      unrelated_pending: 1,
      announcements: 1,
    });
  } finally {
    db.stop();
  }
});
