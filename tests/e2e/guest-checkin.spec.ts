import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { TestPostgres } from "../support/postgres";
test("check-in real: concorrência familiar/individual, seleção parcial, notices únicas e RSVP independente", async () => {
  const db = new TestPostgres();
  await db.start();
  try {
    const event = "00000000-0000-4000-8000-000000000001",
      admin = randomUUID(),
      staff = randomUUID();
    db.sql(
      `insert into auth.users(id) values('${admin}'),('${staff}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST');`,
    );
    const action = (action: string, payload: object) =>
      db.rpc(admin, "admin_action", {
        p_event: event,
        p_action: action,
        p_payload: payload,
      });
    const guests = [
      "Chefe concorrente",
      "Membro individual",
      "Membro familiar",
      "Membro ainda ausente",
    ].map((name) => action("GUEST_CREATE", { name }));
    const family = action("INVITATION_SAVE", {
      name: "Família concorrente",
      pin: "1234",
    }).id;
    action("CODE_ROTATE", { id: family, version: 1 });
    action("FAMILY_ADD_MEMBERS", {
      target_id: family,
      target_version: 2,
      guests: guests.map((g) => ({
        id: g.id,
        version: 1,
        invitation_version: 1,
      })),
    });
    action("INVITATION_SAVE", {
      id: family,
      version: JSON.parse(
        db.sql(`select version from invitations where id='${family}';`),
      ),
      name: "Família concorrente",
      active: true,
      primary_guest_id: guests[0].id,
    });
    const familyTicket = db.rpc(admin, "issue_family_ticket", {
      p_event: event,
      p_invitation: family,
    });
    const individual = db.rpc(admin, "issue_ticket", {
      p_event: event,
      p_guest: guests[1].id,
    });
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    const before = JSON.parse(
      db.sql(
        `select jsonb_agg(status order by guest_id) from rsvps where guest_id in (${guests.map((g) => `'${g.id}'`).join(",")});`,
      ),
    );
    const send = (type: string, payload: object) =>
      db.parallelSql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${staff}';select app_mutate('${event}','${randomUUID()}','${type}','${JSON.stringify(payload)}'::jsonb);select pg_sleep(0.1);commit;`,
      );
    const single = {
      guest_id: guests[1].id,
      method: "QR",
      token_hash: hash(individual.token),
    };
    await Promise.all([
      send("CHECKIN_CREATE", single),
      send("CHECKIN_CREATE", single),
    ]);
    const group = {
      guest_ids: [guests[0].id, guests[2].id],
      method: "QR",
      token_hash: hash(familyTicket.token),
    };
    await Promise.all([
      send("CHECKIN_FAMILY", group),
      send("CHECKIN_FAMILY", group),
    ]);
    expect(
      JSON.parse(
        db.sql(
          `select count(*) from checkins where guest_id in (${guests.map((g) => `'${g.id}'`).join(",")});`,
        ),
      ),
    ).toBe(3);
    expect(
      JSON.parse(
        db.sql(
          `select count(*) from guest_checkin_notices where recipient_guest_id='${guests[0].id}';`,
        ),
      ),
    ).toBe(1);
    expect(
      JSON.parse(
        db.sql(
          `select to_jsonb(exists(select 1 from checkins where guest_id='${guests[3].id}'));`,
        ),
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        db.sql(
          `select jsonb_agg(status order by guest_id) from rsvps where guest_id in (${guests.map((g) => `'${g.id}'`).join(",")});`,
        ),
      ),
    ).toEqual(before);
    const resolved = db.rpc(staff, "resolve_checkin_ticket", {
      p_event: event,
      p_token: familyTicket.token,
    });
    expect(resolved.kind).toBe("FAMILY");
    expect(
      resolved.guests.filter((g: { checked_in: boolean }) => g.checked_in),
    ).toHaveLength(3);
  } finally {
    db.stop();
  }
});
