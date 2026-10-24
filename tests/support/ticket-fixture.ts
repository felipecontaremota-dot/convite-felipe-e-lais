import { randomUUID } from "node:crypto";
import type { TestPostgres } from "./postgres";
export function ticketFixture(db: TestPostgres) {
  const event = "00000000-0000-4000-8000-000000000001";
  const admin = randomUUID(),
    staff = randomUUID(),
    owner = randomUUID(),
    secondDevice = randomUUID(),
    stranger = randomUUID();
  db.sql(`insert into auth.users(id,is_anonymous) values('${admin}',false),('${staff}',false),('${owner}',true),('${secondDevice}',true),('${stranger}',true);
    insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST');`);
  const action = (type: string, payload: object) =>
    db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: type,
      p_payload: payload,
    });
  const a = action("GUEST_CREATE", { name: "Pessoa QR familiar" }),
    b = action("GUEST_CREATE", { name: "Integrante QR familiar" }),
    individual = action("GUEST_CREATE", { name: "Pessoa QR individual" });
  const family = action("INVITATION_SAVE", { name: "Família QR", pin: "1234" });
  action("CODE_ROTATE", { id: family.id, version: 1 });
  action("FAMILY_ADD_MEMBERS", {
    target_id: family.id,
    target_version: 2,
    guests: [
      { id: a.id, version: 1, invitation_version: 1 },
      { id: b.id, version: 1, invitation_version: 1 },
    ],
  });
  db.sql(`update rsvps set status='CONFIRMED' where guest_id in ('${a.id}','${b.id}','${individual.id}');
    update guests set profile_confirmed_at=now() where id in ('${a.id}','${b.id}','${individual.id}');
    insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id) values
    ('${event}','${owner}','${family.id}',now(),'${a.id}'),('${event}','${secondDevice}','${family.id}',now(),'${a.id}'),('${event}','${stranger}','${individual.invitation_id}',now(),'${individual.id}');`);
  return {
    event,
    admin,
    staff,
    owner,
    secondDevice,
    stranger,
    a: { ...a, name: "Pessoa QR familiar" },
    b: { ...b, name: "Integrante QR familiar" },
    individual: { ...individual, name: "Pessoa QR individual" },
    family,
    action,
  };
}
