import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres(),
  event = "00000000-0000-4000-8000-000000000001",
  admin = "deaffeed-0000-4000-8000-000000000001";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${admin}'); insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
  );
});
test.afterAll(() => db.stop());
const snapshot = (uid = admin) =>
  db.rpc(uid, "app_snapshot", { p_event: event });
const action = (p_action: string, p_payload: object) =>
  db.rpc(admin, "admin_action", { p_event: event, p_action, p_payload });
function family(label: string) {
  const first = action("GUEST_CREATE", {
    name: `Pessoa ${label}`,
    whatsapp: "62999994778",
    email: "control@example.test",
  });
  const other = action("GUEST_CREATE", { name: `Acompanhante ${label}` });
  const unit = action("INVITATION_SAVE", {
    name: `Família ${label}`,
    pin: "4778",
  });
  action("CODE_ROTATE", { id: unit.id, version: 1 });
  const s = snapshot();
  action("FAMILY_ADD_MEMBERS", {
    target_id: unit.id,
    target_version: 2,
    guests: [first, other].map((g) => ({
      id: g.id,
      version: s.guests.find((p: { id: string }) => p.id === g.id).version,
      invitation_version: s.invitations.find(
        (i: { id: string }) => i.id === g.invitation_id,
      ).version,
    })),
  });
  db.sql(
    `update guests set profile_confirmed_at=now() where id='${first.id}'; update rsvps set dietary='Sem lactose',note='Nota preservada' where guest_id='${first.id}';`,
  );
  return { first, other, unit, name: `Pessoa ${label}` };
}
async function backend(
  page: Page,
  uid = admin,
  options: { fail?: boolean; hold?: Promise<void> } = {},
) {
  const exp = Math.floor(Date.now() / 1000) + 3600,
    enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: uid !== admin,
    email: "control@example.test",
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  const calls: { action: string; payload: Record<string, unknown> }[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    try {
      if (path.startsWith("/auth/"))
        data = path.endsWith("/user") ? user : session;
      else if (path.startsWith("/rest/v1/rpc/")) {
        if (args.p_action)
          calls.push({ action: args.p_action, payload: args.p_payload });
        if (
          ["GUEST_RSVP_SET", "GUEST_INVITATION_SENT_SET"].includes(
            args.p_action,
          )
        ) {
          if (options.hold) await options.hold;
          if (options.fail) throw Error("controlled failure");
        }
        data = db.rpc(uid, path.split("/").at(-1)!, args);
      } else if (path === "/functions/v1/redeem-invitation") {
        const quote = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
        data = JSON.parse(
          db
            .sql(
              `begin;set local role service_role;select redeem_invitation_by_name(${[event, uid, args.name, args.pin, "admin-controls-fixture"].map(quote).join(",")});commit;`,
            )
            .trim(),
        );
      }
    } catch {
      status = 400;
      data = { message: "Não foi possível salvar a alteração.", code: "P0001" };
    }
    await route.fulfill({ status, json: data });
  });
  return calls;
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("control@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
for (const width of [320, 1280])
  test(`individual sending, four RSVP states, dashboard and guest synchronization at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const f = family(`controles ${width}`),
      calls = await backend(page);
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Convidados", exact: true }).click();
    const row = page.locator(`[data-guest-row="${f.first.id}"]`),
      other = page.locator(`[data-guest-row="${f.other.id}"]`);
    const send = row.getByRole("button", { name: /Convite não enviado —/ });
    await expect(send).toHaveAttribute(
      "title",
      "Convite não enviado — clique para marcar como enviado.",
    );
    expect(
      await send.evaluate(
        (el) =>
          !!(
            el.compareDocumentPosition(
              el
                .closest("[data-guest-row]")!
                .querySelector('[aria-label^="Copiar link"]')!,
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    await send.focus();
    await page.keyboard.press("Enter");
    await expect(
      row.getByRole("button", { name: /Convite enviado —/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      snapshot().guests.find((g: { id: string }) => g.id === f.other.id)
        .invitation_sent,
    ).toBe(false);
    await expect(
      other.getByRole("button", { name: /Convite não enviado —/ }),
    ).toBeVisible();
    const beforeCopy = calls.filter(
      (c) => c.action === "GUEST_INVITATION_SENT_SET",
    ).length;
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await row
      .getByRole("button", {
        name: `Copiar link do convite de ${f.name}`,
        exact: true,
      })
      .click();
    expect(
      calls.filter((c) => c.action === "GUEST_INVITATION_SENT_SET"),
    ).toHaveLength(beforeCopy);
    const select = row.getByRole("combobox", {
      name: `Alterar confirmação de presença de ${f.name}`,
      exact: true,
    });
    await expect(select.locator("option")).toHaveText([
      "Pendente",
      "Confirmado",
      "Não irá",
      "Talvez",
    ]);
    for (const value of [
      "CONFIRMED",
      "DECLINED",
      "PENDING",
      "MAYBE",
      "CONFIRMED",
    ]) {
      await select.selectOption(value);
      await expect
        .poll(() => {
          const r = snapshot().rsvps.find(
            (r: { guest_id: string }) => r.guest_id === f.first.id,
          );
          return r.status === "PENDING" && r.responded_at ? "MAYBE" : r.status;
        })
        .toBe(value);
      await expect(select).not.toBeDisabled();
      await expect(select).toHaveCSS(
        "background-color",
        {
          CONFIRMED: "rgb(232, 245, 237)",
          DECLINED: "rgb(252, 237, 238)",
          MAYBE: "rgb(255, 248, 223)",
          PENDING: "rgb(234, 242, 250)",
        }[value]!,
      );
      expect(
        snapshot().rsvps.find(
          (r: { guest_id: string }) => r.guest_id === f.first.id,
        ),
      ).toMatchObject({
        dietary: "Sem lactose",
        note: "Nota preservada",
        source: "ADMIN",
      });
      expect(
        snapshot().guests.find((g: { id: string }) => g.id === f.first.id)
          .invitation_sent,
      ).toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
    }
    await select.focus();
    await expect(select).toBeFocused();
    await expect(select).toHaveCSS("outline-style", "solid");
    const proportions = await select.evaluate((el) => {
      const css = getComputedStyle(el),
        row = el.closest("[data-guest-row]")!,
        action = row.querySelector('[aria-label^="Convite enviado —"]')!,
        sizing = el.previousElementSibling!.firstElementChild!;
      return {
        height: el.getBoundingClientRect().height,
        tagHeight: sizing.getBoundingClientRect().height,
        width: el.getBoundingClientRect().width,
        appearance: css.appearance,
        backgroundImage: css.backgroundImage,
        paddingLeft: css.paddingLeft,
        paddingRight: css.paddingRight,
        fontSize: css.fontSize,
        sameFontAsTag: css.fontFamily === getComputedStyle(sizing).fontFamily,
        radius: css.borderRadius,
        immediatelyBeforeActions: el
          .closest("select")!
          .parentElement!.parentElement!.parentElement!.nextElementSibling?.contains(
            action,
          ),
      };
    });
    expect(proportions).toMatchObject({
      sameFontAsTag: true,
      appearance: "none",
      backgroundImage: "none",
      paddingLeft: "8px",
      paddingRight: "8px",
      fontSize: "13px",
      radius: "6px",
      immediatelyBeforeActions: true,
    });
    expect(proportions.height).toBe(proportions.tagHeight);
    expect(proportions.height).toBeLessThanOrEqual(30);
    expect(proportions.width).toBeLessThan(115);
    const beforeSame = calls.length;
    await select.selectOption("CONFIRMED");
    expect(calls).toHaveLength(beforeSame);
    await page.screenshot({
      path: `/tmp/admin-guest-controls-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(select).toHaveValue("CONFIRMED");
    await expect(
      row.getByRole("button", { name: /Convite enviado —/ }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Filtrar convidados", exact: true })
      .selectOption("SENT");
    await expect(row).toBeVisible();
    await expect(other).toHaveCount(0);
    await page.getByRole("link", { name: "Painel", exact: true }).click();
    const all = snapshot(),
      sent = all.guests.filter(
        (g: { invitation_sent: boolean }) => g.invitation_sent,
      ).length;
    await expect(
      page.getByRole("button", {
        name: `Na lista: ${all.guests.length}`,
        exact: true,
      }),
    ).toBeVisible();
    const card = page.getByRole("button", {
      name: `Convidados: ${sent}`,
      exact: true,
    });
    await card.click();
    const dialog = page.getByRole("dialog", {
      name: `Convidados com convite enviado — ${sent}`,
      exact: true,
    });
    await expect(dialog.getByText(f.name, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Open a second real database-backed guest session; administrative changes use the same row.
    const uid = randomUUID();
    db.sql(
      `insert into auth.users(id,is_anonymous) values('${uid}',true); insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id) values('${event}','${uid}','${f.unit.id}',now(),'${f.first.id}');`,
    );
    const context = await browser.newContext({
        baseURL: "http://127.0.0.1:8083",
        viewport: { width, height: 900 },
      }),
      guest = await context.newPage();
    await backend(guest, uid);
    await guest.goto("/");
    await guest.getByLabel("Nome do convidado", { exact: true }).fill(f.name);
    await guest.getByLabel("Senha do convite", { exact: true }).fill("4778");
    await guest
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(guest).toHaveURL(/\/inicio$/);
    await expect(
      guest.getByRole("button", {
        name: "Sua presença está confirmada.",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Convidados", exact: true }).click();
    for (const [value, label] of [
      ["DECLINED", "Sua ausência foi confirmada, sentiremos sua falta."],
      ["PENDING", "Ainda dá tempo de você confirmar sua presença."],
    ] as const) {
      await select.selectOption(value);
      await expect(select).not.toBeDisabled();
      if (value === "DECLINED")
        await guest.evaluate(() => window.dispatchEvent(new Event("focus")));
      else await guest.reload();
      await expect(
        guest.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    await guest.getByRole("link", { name: "Presença", exact: true }).click();
    const radio = guest
      .getByRole("radio", {
        name: "Sim, eu vou, já tô com a roupa de ir",
        exact: true,
      })
      .first();
    await expect(radio).toBeVisible();
    await guest.screenshot({
      path: `/tmp/rsvp-colors-${width}.png`,
      animations: "disabled",
    });
    const emphases = [...["eu vou", "Não vou", "Não sei ainda"]];
    for (const [index, label] of emphases.entries()) {
      const text = guest.getByText(label, { exact: true }).first();
      await expect(text).toHaveCSS(
        "color",
        ["rgb(3, 171, 0)", "rgb(255, 0, 34)", "rgb(255, 183, 0)"][index],
      );
      await expect(text).toHaveCSS("font-weight", "700");
      expect(
        await text.evaluate(
          (el) => getComputedStyle(el.parentElement!).fontWeight,
        ),
      ).toBe("400");
      expect(
        await text.evaluate((el) => getComputedStyle(el).textDecorationLine),
      ).toContain("underline");
    }
    await radio.click();
    await guest
      .getByRole("button", { name: "Pode reservar meu lugar! 🎉", exact: true })
      .first()
      .click();
    await expect
      .poll(
        () =>
          snapshot().rsvps.find(
            (r: { guest_id: string }) => r.guest_id === f.first.id,
          ).status,
      )
      .toBe("CONFIRMED");
    expect(
      snapshot().guests.find((g: { id: string }) => g.id === f.first.id)
        .invitation_sent,
    ).toBe(true);
    expect(snapshot().messages).toHaveLength(0);
    await context.close();
  });

test("failed and delayed administrative writes keep the prior state and prevent duplicate clicks", async ({
  page,
}) => {
  const f = family("falha"),
    options: { fail?: boolean; hold?: Promise<void> } = { fail: true },
    calls = await backend(page, admin, options);
  await login(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  const row = page.locator(`[data-guest-row="${f.first.id}"]`),
    select = row.getByRole("combobox");
  await select.selectOption("CONFIRMED");
  await expect(select).not.toBeDisabled();
  await expect(select).toHaveValue("PENDING");
  await row.getByRole("button", { name: /Convite não enviado —/ }).click();
  await expect(
    row.getByRole("button", { name: /Convite não enviado —/ }),
  ).not.toBeDisabled();
  expect(
    snapshot().guests.find((g: { id: string }) => g.id === f.first.id)
      .invitation_sent,
  ).toBe(false);
  options.fail = false;
  let release!: () => void;
  options.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const button = row.getByRole("button", { name: /Convite não enviado —/ });
  const before = calls.length;
  await button.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(button).toBeDisabled();
  expect(calls.length - before).toBe(1);
  release();
  await expect(
    row.getByRole("button", { name: /Convite enviado —/ }),
  ).toBeVisible();
});

test("dashboard email reuses a retained request, confirms real receipts and never changes RSVP", async ({
  page,
}) => {
  const f = family("painel email");
  action("GUEST_RSVP_SET", {
    id: f.first.id,
    status: "CONFIRMED",
    expected_status: "PENDING",
    expected_responded_at: null,
  });
  const prior = snapshot().rsvps.find(
    (r: { guest_id: string }) => r.guest_id === f.first.id,
  );
  await backend(page);
  const requests: { request_id: string; guest_id: string }[] = [];
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "http://127.0.0.1:54321/functions/v1/send-invitations",
    async (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (requests.length === 1) {
        await hold;
        await route.fulfill({
          status: 400,
          json: { message: "controlled failure" },
        });
        return;
      }
      db.sql(
        `insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,status,sent_at) values('${event}','${f.unit.id}','${f.first.id}','${body.request_id}','control@example.test','sent',now());`,
      );
      await route.fulfill({
        json: {
          pending: 0,
          sent: 1,
          skipped: 0,
          failed: 0,
          results: [{ status: "sent" }],
        },
      });
    },
  );
  await login(page);
  await page.getByRole("button", { name: /^Confirmados:/ }).click();
  const dialog = page.locator("[data-admin-modal]"),
    row = dialog.locator("[data-dashboard-guest]").filter({ hasText: f.name });
  await expect(row.getByText("Não enviado", { exact: true })).toBeVisible();
  const send = row.getByRole("button", {
    name: `Enviar convite para ${f.name}`,
    exact: true,
  });
  await send.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect.poll(() => requests.length).toBe(1);
  await expect(send).toBeDisabled();
  release();
  await expect(
    row.getByText(/Não foi possível confirmar o envio/),
  ).toBeVisible();
  await expect(row.getByText("Não enviado", { exact: true })).toBeVisible();
  await send.click();
  await expect(row.getByText("Enviado", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]!.guest_id).toBe(f.first.id);
  expect(requests[1]!.request_id).toBe(requests[0]!.request_id);
  expect(
    snapshot().rsvps.find(
      (r: { guest_id: string }) => r.guest_id === f.first.id,
    ),
  ).toEqual(prior);
  expect(
    snapshot().guests.find((g: { id: string }) => g.id === f.other.id)
      .invitation_sent,
  ).toBe(false);
  await expect(dialog).toBeVisible();
});
