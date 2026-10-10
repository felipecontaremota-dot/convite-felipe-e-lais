import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/postgres";

test("cerimonial real: todos os estados de RSVP disponíveis para entrada manual sem dados privados", async ({
  page,
}) => {
  const db = new TestPostgres();
  await db.start();
  try {
    const event = "00000000-0000-4000-8000-000000000001",
      admin = randomUUID(),
      staff = randomUUID();
    db.sql(
      `insert into auth.users(id) values('${admin}'),('${staff}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST');`,
    );
    const people = ["CONFIRMED", "DECLINED", "MAYBE", "PENDING"].map(
      (status) => {
        const guest = db.rpc(admin, "admin_action", {
          p_event: event,
          p_action: "GUEST_CREATE",
          p_payload: { name: `Pessoa ${status}` },
        });
        db.sql(
          `update rsvps set status='${status}',note='Observação privada',dietary='Dieta privada' where guest_id='${guest.id}';`,
        );
        return { ...guest, status };
      },
    );
    const inactive = db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name: "Pessoa inativa" },
    });
    db.sql(
      `update invitations set active=false where id='${inactive.invitation_id}';`,
    );
    const otherEvent = randomUUID(),
      otherUnit = randomUUID(),
      otherGuest = randomUUID();
    db.sql(
      `insert into events(id,title,starts_at,timezone) values('${otherEvent}','Outro evento',now(),'America/Sao_Paulo');insert into invitations(id,event_id,name) values('${otherUnit}','${otherEvent}','Outra família');insert into guests(id,event_id,invitation_id,name) values('${otherGuest}','${otherEvent}','${otherUnit}','Pessoa de outro evento');`,
    );
    const snapshot = db.rpc(staff, "app_snapshot", { p_event: event });
    expect(snapshot.guests.map((g: { id: string }) => g.id).sort()).toEqual(
      people.map((g) => g.id).sort(),
    );
    expect(
      snapshot.rsvps.map((r: { status: string }) => r.status).sort(),
    ).toEqual(people.map((g) => g.status).sort());
    for (const rsvp of snapshot.rsvps) {
      expect(rsvp.note).toBe("");
      expect(rsvp.dietary).toBe("");
    }
    expect(snapshot.contacts).toEqual([]);
    const exp = Math.floor(Date.now() / 1000) + 3600,
      encode = (v: unknown) =>
        Buffer.from(JSON.stringify(v)).toString("base64url");
    const user = {
      id: staff,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: false,
    };
    const session = {
      access_token: `${encode({ alg: "HS256" })}.${encode({ sub: staff, exp, role: "authenticated" })}.fixture`,
      refresh_token: "fixture-staff-refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      user,
    };
    await page.addInitScript((s) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(s));
    }, session);
    await page.route("http://127.0.0.1:54321/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = {};
      if (path === "/auth/v1/user") data = user;
      else if (path.startsWith("/auth/")) data = session;
      else if (path.startsWith("/rest/v1/rpc/"))
        data = db.rpc(
          staff,
          path.split("/").at(-1)!,
          route.request().postDataJSON() || {},
        );
      await route.fulfill({ status: 200, json: data });
    });
    await page.goto("/checkin");
    await expect(
      page.getByText("0 / 4 presentes", { exact: true }),
    ).toBeVisible();
    for (const person of people)
      await expect(
        page.getByRole("button", {
          name: `Registrar entrada manualmente: Pessoa ${person.status}`,
          exact: true,
        }),
      ).toBeVisible();
    await expect(page.getByText("Pessoa inativa", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("Pessoa de outro evento", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Registrar entrada manualmente: Pessoa MAYBE",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmar entrada", exact: true })
      .click();
    await expect(
      page.getByText("1 / 4 presentes", { exact: true }),
    ).toBeVisible();
    expect(
      JSON.parse(
        db.sql(
          `select count(*) from checkins where guest_id='${people[2].id}';`,
        ),
      ),
    ).toBe(1);
    expect(
      JSON.parse(
        db.sql(
          `select to_jsonb(status) from rsvps where guest_id='${people[2].id}';`,
        ),
      ),
    ).toBe("MAYBE");
  } finally {
    db.stop();
  }
});
