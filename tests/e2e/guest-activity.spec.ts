import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/postgres";
import { ticketFixture } from "../support/ticket-fixture";
const db = new TestPostgres();
let f: ReturnType<typeof ticketFixture>;
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  f = ticketFixture(db);
  db.sql(`insert into audit_logs(event_id,actor,action,entity,entity_id,metadata,created_at)
 select '${f.event}','${f.owner}','UPDATE','rsvps',r.id,'{}','2026-10-01T12:00:00Z' from rsvps r where guest_id='${f.a.id}';
 insert into audit_logs(event_id,actor,action,entity,entity_id,metadata,created_at)
 select '${f.event}','${f.owner}','LOGIN','guest_activity','${f.a.id}',jsonb_build_object(
 'kind','LOGIN','guest_id','${f.a.id}','guest_name','Pessoa QR familiar','actor_guest_id','${f.a.id}',
 'actor_role','GUEST','access_mode','NAME_PIN','device','iPhone','ip','2001:db8:1234:abcd:1234:abcd:1234:abcd'),clock_timestamp()-make_interval(mins=>n)
 from generate_series(1,37)n;
 insert into audit_logs(event_id,actor,action,entity,entity_id,metadata)
 select '${f.event}','${f.owner}','UPDATE','rsvps',id,jsonb_build_object('activity_version',1,'status_changed',true,
 'guest_id',guest_id,'guest_name','Pessoa QR familiar','actor_guest_id',guest_id,'actor_role','GUEST','next',v.status,'access_mode','LINK')
 from rsvps cross join (values('CONFIRMED'),('DECLINED'),('MAYBE'))v(status) where guest_id='${f.a.id}';`);
});
test.afterAll(() => db.stop());
async function backend(
  page: Page,
  uid: string,
  fail: boolean | "malformed" = false,
) {
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: uid === f.owner,
    email: "fixture@example.test",
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  const calls: { fn: string; args: any }[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    try {
      let data: unknown = {};
      if (path.startsWith("/auth/"))
        data = path.endsWith("/user") ? user : session;
      else if (path.startsWith("/rest/v1/rpc/")) {
        const fn = path.split("/").at(-1)!;
        calls.push({ fn, args });
        if (fail === true && fn === "guest_activity_history")
          throw Error("controlled outage");
        data =
          fail === "malformed" && fn === "guest_activity_history"
            ? {}
            : db.rpc(uid, fn, args);
      } else if (path === "/functions/v1/redeem-invitation") {
        const quote = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
        data = JSON.parse(
          db
            .sql(
              `begin;set local role service_role;select redeem_invitation_tracked('${f.event}','${uid}',null,${quote(args.name)},${quote(args.pin)},'browser-fixture','iPhone',null);commit;`,
            )
            .trim(),
        );
      }
      await route.fulfill({ json: data });
    } catch {
      await route.fulfill({
        status: 400,
        json: { message: "controlled failure", code: "P0001" },
      });
    }
  });
  return calls;
}
async function admin(page: Page) {
  await backend(page, f.admin);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
for (const width of [320, 390, 768, 1280])
  test(`ADMIN confirmations position, colors, cursor and existing guest editor at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await admin(page);
    const section = page.getByTestId("admin-confirmations"),
      rows = section.locator("[data-guest-activity]");
    await expect(rows).toHaveCount(20);
    await section.scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => {
      const section = document.querySelector(
        '[data-testid="admin-confirmations"]',
      )!;
      const exit = [...document.querySelectorAll('[role="button"]')].find(
        (n) => n.textContent === "Sair deste dispositivo",
      )!;
      const footer = [...document.querySelectorAll("div")]
        .filter(
          (n) =>
            n.textContent?.startsWith(
              "Com carinho, Felipe & Laís · Seus dados",
            ) && n.children.length === 0,
        )
        .at(-1)!;
      return {
        exit: exit.getBoundingClientRect().bottom,
        section: section.getBoundingClientRect().top,
        footer: footer.getBoundingClientRect().top,
        end: section.getBoundingClientRect().bottom,
      };
    });
    expect(position.section).toBeGreaterThan(position.exit);
    expect(position.footer).toBeGreaterThan(position.end);
    for (const [label, color] of [
      ["PRESENÇA", "rgb(35, 103, 70)"],
      ["NÃO IRÁ", "rgb(163, 59, 67)"],
      ["TALVEZ IRÁ", "rgb(118, 84, 0)"],
    ]) {
      await expect(
        section.getByText(label!, { exact: true }).first(),
      ).toHaveCSS("color", color!);
      await expect(
        section.getByText(label!, { exact: true }).first(),
      ).toHaveCSS("font-weight", "700");
    }
    await expect(
      section.getByText(/iPhone · IP 2001:db8/).first(),
    ).toBeVisible();
    const initialIds = await rows.evaluateAll((ns) =>
      ns.map((n) => n.getAttribute("data-guest-activity")),
    );
    await section
      .getByRole("button", { name: "Carregar mais registros", exact: true })
      .click();
    await expect.poll(() => rows.count()).toBeGreaterThan(20);
    const ids = await rows.evaluateAll((ns) =>
      ns.map((n) => n.getAttribute("data-guest-activity")),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 20)).toEqual(initialIds);
    const name = section
      .getByRole("button", {
        name: "Editar convidado Pessoa QR familiar",
        exact: true,
      })
      .first();
    await name.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Editar convidado",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Nome", { exact: true })).toHaveValue(
      f.a.name,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(name).toBeFocused();
    await expect(page).toHaveURL(/\/painel$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await section
      .getByRole("heading", { name: "Confirmações", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/confirmations-${width}.png`,
      animations: "disabled",
    });
    expect(
      await rows.evaluateAll((nodes) =>
        nodes.every((n) => n.scrollWidth <= n.clientWidth),
      ),
    ).toBe(true);
    expect(await section.textContent()).not.toMatch(/null|undefined/);
    await section
      .getByText(/iPhone · IP 2001:db8/)
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/confirmations-technical-${width}.png`,
      animations: "disabled",
    });
    await section
      .getByRole("button", { name: "Carregar mais registros", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/confirmations-footer-${width}.png`,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
test("new confirmed activity appears automatically and edit saves only the selected ID", async ({
  page,
}) => {
  await page.clock.install();
  await admin(page);
  const section = page.getByTestId("admin-confirmations");
  await expect(section.locator("[data-guest-activity]")).toHaveCount(20);
  const r = db
    .rpc(f.admin, "app_snapshot", { p_event: f.event })
    .rsvps.find((r: any) => r.guest_id === f.a.id);
  f.action("GUEST_RSVP_SET", {
    id: f.a.id,
    status: "DECLINED",
    expected_status: r.status,
    expected_responded_at: r.responded_at,
  });
  await page.clock.fastForward(31000);
  await expect(section.locator("[data-guest-activity]").first()).toContainText(
    "pelos administradores",
  );
  const name = section
    .getByRole("button", { name: `Editar convidado ${f.a.name}`, exact: true })
    .first();
  await name.click();
  const dialog = page.getByRole("dialog", {
    name: "Editar convidado",
    exact: true,
  });
  await dialog
    .getByLabel("Observações", { exact: true })
    .fill("Edição pela seção Confirmações");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    db
      .rpc(f.admin, "app_snapshot", { p_event: f.event })
      .guests.find((g: any) => g.id === f.a.id).admin_notes,
  ).toBe("Edição pela seção Confirmações");
});
test("guest route tracking ignores ticks/refetch/rerenders and records real reentries and explicit logout", async ({
  page,
}) => {
  const calls = await backend(page, f.owner);
  await page.goto("/");
  await page.getByLabel("Nome do convidado", { exact: true }).fill(f.a.name);
  await page.getByLabel("Senha do convite", { exact: true }).fill("1234");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId("admin-confirmations")).toHaveCount(0);
  const events = () =>
    calls
      .filter((c) => c.fn === "record_guest_activity")
      .map((c) => c.args.p_kind);
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  await expect.poll(events).toEqual(["PRESENTES"]);
  await page.clock.install();
  await page.clock.fastForward(16000);
  expect(events()).toEqual(["PRESENTES"]);
  await page.getByRole("link", { name: "Local", exact: true }).click();
  await expect.poll(events).toEqual(["PRESENTES", "LOCAL"]);
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  await expect.poll(events).toEqual(["PRESENTES", "LOCAL", "PRESENTES"]);
  await page.getByRole("link", { name: "Informações", exact: true }).click();
  await expect
    .poll(events)
    .toEqual(["PRESENTES", "LOCAL", "PRESENTES", "INFORMACOES"]);
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  await expect
    .poll(events)
    .toEqual(["PRESENTES", "LOCAL", "PRESENTES", "INFORMACOES", "CONVITES"]);
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await expect
    .poll(events)
    .toEqual([
      "PRESENTES",
      "LOCAL",
      "PRESENTES",
      "INFORMACOES",
      "CONVITES",
      "LOGOUT",
    ]);
  await expect(page).toHaveURL(/\/$/);
});
test("history failure is bounded and preserves the dashboard and retry action", async ({
  page,
}) => {
  await backend(page, f.admin, true);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByTestId("admin-confirmations").getByRole("button", {
      name: "Carregar confirmações novamente",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Confirmados:/ }),
  ).toBeVisible();
});

test("CEREMONIALIST cannot render or request the ADMIN activity feed", async ({
  page,
}) => {
  const calls = await backend(page, f.staff);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/painel");
  await expect(page.getByTestId("admin-confirmations")).toHaveCount(0);
  expect(calls.filter((c) => c.fn === "guest_activity_history")).toEqual([]);
});
test("homonymous historical names open the existing editor by guest ID", async ({
  page,
}) => {
  const source = randomUUID();
  db.sql(
    `update guests set name='Nome Homônimo' where id in ('${f.a.id}','${f.individual.id}');insert into audit_logs(id,event_id,actor,action,entity,entity_id,metadata) values('${source}','${f.event}','${f.owner}','LOGIN','guest_activity','${f.individual.id}',jsonb_build_object('guest_id','${f.individual.id}','guest_name','Nome Homônimo','access_mode','LINK'));`,
  );
  await admin(page);
  await page
    .locator(`[data-guest-activity="${source}"]`)
    .getByRole("button", {
      name: "Editar convidado Nome Homônimo",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Editar convidado",
    exact: true,
  });
  await dialog
    .getByLabel("Observações", { exact: true })
    .fill("Identificador individual preservado");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const s = db.rpc(f.admin, "app_snapshot", { p_event: f.event });
  expect(s.guests.find((g: any) => g.id === f.individual.id).admin_notes).toBe(
    "Identificador individual preservado",
  );
  expect(s.guests.find((g: any) => g.id === f.a.id).admin_notes).not.toBe(
    "Identificador individual preservado",
  );
});

test("malformed history response never crashes password login or the rest of the dashboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await backend(page, f.admin, "malformed");
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page
      .getByTestId("admin-confirmations")
      .getByRole("button", {
        name: "Carregar confirmações novamente",
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Confirmados:/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Minha conta", exact: true }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
