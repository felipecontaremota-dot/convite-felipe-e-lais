import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { TestPostgres } from "../support/postgres";
const event = "00000000-0000-4000-8000-000000000001",
  admin = "ddddaabb-0000-4000-8000-000000000001";
const db = new TestPostgres();
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${admin}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
  );
});
test.afterAll(() => db.stop());
const action = (p_action: string, p_payload: object) =>
  db.rpc(admin, "admin_action", { p_event: event, p_action, p_payload });
function individual(name: string) {
  const guest = action("GUEST_CREATE", {
    name,
    whatsapp: "62999994778",
    email: "before@example.test",
  });
  const snap = db.rpc(admin, "app_snapshot", { p_event: event });
  return {
    ...guest,
    name,
    code: snap.invitations.find(
      (i: { id: string }) => i.id === guest.invitation_id,
    ).sharing_code,
  };
}
function actor() {
  const id = randomUUID();
  db.sql(`insert into auth.users(id,is_anonymous) values('${id}',true);`);
  return id;
}
async function backend(
  page: Page,
  uid: string,
  options: { fail?: boolean; legacy?: boolean; commitThenFail?: boolean } = {},
) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: true,
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  const calls: {
    type: string;
    payload: Record<string, unknown>;
    id: string;
  }[] = [];
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({
      json: route.request().url().includes("/user") ? user : session,
    });
  });
  await page.route("**/functions/v1/redeem-invitation", async (route) => {
    const body = route.request().postDataJSON();
    const quote = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
    const fn =
      body.action === "name_pin"
        ? "redeem_invitation_by_name"
        : body.action === "identify"
          ? "identify_invitation"
          : "redeem_invitation_link";
    const args =
      body.action === "identify"
        ? [event, uid, body.code, "confirmation-fixture"]
        : [
            event,
            uid,
            body.action === "name_pin" ? body.name : body.code,
            body.pin,
            "confirmation-fixture",
          ];
    try {
      const data = JSON.parse(
        db
          .sql(
            `begin;set local role service_role;select ${fn}(${args.map(quote).join(",")});commit;`,
          )
          .trim(),
      );
      await route.fulfill({ json: data });
    } catch {
      await route.fulfill({
        status: 400,
        json: { code: "invalid_credentials" },
      });
    }
  });
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const fn = route.request().url().split("/").pop()!;
    const args = route.request().postDataJSON();
    if (fn === "app_mutate")
      calls.push({
        type: args.p_type,
        payload: args.p_payload,
        id: args.p_mutation,
      });
    if (
      fn === "app_mutate" &&
      args.p_type === "CONTACT_UPDATE" &&
      options.failContact
    ) {
      await route.fulfill({
        status: 500,
        json: { message: "controlled contact failure" },
      });
      return;
    }
    if (
      fn === "app_mutate" &&
      args.p_type === "PROFILE_CONFIRM" &&
      options.fail
    ) {
      await route.fulfill({
        status: 500,
        json: { message: "controlled failure" },
      });
      return;
    }
    try {
      const data = db.rpc(uid, fn, args);
      if (fn === "app_snapshot" && options.legacy)
        delete data.profile_confirmation;
      if (
        fn === "app_mutate" &&
        args.p_type === "PROFILE_CONFIRM" &&
        options.commitThenFail
      ) {
        options.commitThenFail = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ json: data });
    } catch {
      await route.fulfill({
        status: 400,
        json: { message: "profile confirmation conflict", code: "P0001" },
      });
    }
  });
  return calls;
}
async function loginName(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Nome do convidado", { exact: true }).fill(name);
  await page.getByLabel("Senha do convite", { exact: true }).fill("4778");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
}
const modal = (page: Page) =>
  page.getByRole("dialog", {
    name: "💙 Antes de continuar, confirme seus dados!",
    exact: true,
  });
async function fill(page: Page, name = "Nome conferido") {
  await modal(page).getByLabel("Nome completo", { exact: true }).fill(name);
  await modal(page).getByLabel("WhatsApp", { exact: true }).fill("62999994778");
  await modal(page)
    .getByLabel("E-mail", { exact: true })
    .fill("confirmed@example.test");
}
test("confirmation PostgreSQL security and preservation matrix", () => {
  expect(
    db.sql(readFileSync("tests/profile-confirmation.sql", "utf8")),
  ).toContain("Profile confirmation:");
});
for (const width of [320, 375, 390, 768, 1280])
  test(`first name login requires accessible confirmation at ${width}px`, async ({
    page,
  }) => {
    const g = individual(`Pessoa primeira ${width}`),
      uid = actor();
    if (width === 390)
      db.sql(
        `update guest_contacts set whatsapp='+55 (62) 9 9999-4778' where guest_id='${g.id}';`,
      );
    const calls = await backend(page, uid);
    await page.setViewportSize({ width, height: 844 });
    await loginName(page, g.name);
    await expect(modal(page)).toBeVisible();
    await expect(
      modal(page).getByText(
        "Queremos garantir que todos os recados importantes cheguem até você! Confira seus dados abaixo e confirme para continuar. 💌",
        { exact: true },
      ),
    ).toHaveCSS("text-align", "center");
    await expect(
      modal(page).getByText(
        "Informar seus contatos não modifica suas permissões de comunicação.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      modal(page).getByRole("button", {
        name: "Preciso de ajuda",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(modal(page).getByLabel("Nome completo")).toHaveValue(g.name);
    await expect(
      modal(page).getByLabel("WhatsApp", { exact: true }),
    ).toHaveValue("(62) 9 9999-4778");
    await expect(modal(page)).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: test.info().outputPath(`confirmation-pending-${width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(modal(page)).toBeVisible();
    await page.reload();
    await expect(modal(page)).toBeVisible();
    await modal(page)
      .getByRole("button", { name: "Confirmar", exact: true })
      .click(); // prefilled valid data is allowed
    await expect(modal(page)).toHaveCount(0);
    expect(calls.filter((c) => c.type === "PROFILE_CONFIRM")).toHaveLength(1);
    await page.reload();
    await expect(modal(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: `Salvar contato de ${g.name}`,
        exact: true,
      }),
    ).toBeVisible();
    const s = db.rpc(uid, "app_snapshot", { p_event: event });
    expect(s.guests[0].profile_confirmed_at).toBeTruthy();
    expect(s.rsvps[0].status).toBe("PENDING");
    if (width === 390) expect(s.contacts[0].whatsapp).toBe("5562999994778");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("exclusive link, correction, refresh and another device share the same persisted guest status", async ({
  page,
  browser,
}) => {
  const g = individual("Pessoa link confirmação"),
    uid = actor();
  await backend(page, uid);
  await page.goto(`/c/${g.code}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("4778");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(modal(page)).toBeVisible();
  await fill(page, "  Nome   Atualizado  ");
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Salvar contato de Nome Atualizado",
      exact: true,
    }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8083",
  });
  const second = await context.newPage();
  await backend(second, actor());
  await loginName(second, "Nome Atualizado");
  await expect(modal(second)).toHaveCount(0);
  await expect(
    second.getByRole("link", { name: "Perfil", exact: true }),
  ).toBeVisible();
  await context.close();
});
test("invalid fields, backend failure, offline and duplicate clicks never fake confirmation", async ({
  page,
  context,
}) => {
  const g = individual("Pessoa erros confirmação"),
    uid = actor(),
    opts = { fail: true };
  const calls = await backend(page, uid, opts);
  await loginName(page, g.name);
  await expect(modal(page)).toBeVisible();
  await modal(page).getByLabel("Nome completo").fill("");
  await modal(page).getByLabel("WhatsApp", { exact: true }).fill("123");
  await modal(page).getByLabel("E-mail", { exact: true }).fill("bad");
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await page.screenshot({
    path: test.info().outputPath("validation-errors.png"),
    fullPage: true,
  });
  await expect(modal(page).getByLabel("Nome completo")).toHaveValue("");
  await expect(
    modal(page).getByText("Informe seu nome completo.", { exact: true }),
  ).toBeVisible();
  await expect(modal(page).getByRole("alert")).toHaveCount(3);
  expect(calls.filter((c) => c.type === "PROFILE_CONFIRM")).toHaveLength(0);
  await fill(page);
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(
    modal(page).getByText("Não foi possível concluir a operação.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(modal(page).getByLabel("Nome completo")).toHaveValue(
    "Nome conferido",
  );
  await context.setOffline(true);
  await expect(
    modal(page).getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  opts.fail = false;
  const button = modal(page).getByRole("button", {
    name: "Confirmar",
    exact: true,
  });
  await button.evaluate((e: HTMLElement) => {
    e.click();
    e.click();
  });
  await expect(modal(page)).toHaveCount(0);
  const sent = calls.filter((c) => c.type === "PROFILE_CONFIRM");
  expect(sent).toHaveLength(2);
  expect(sent[0]!.id).toBe(sent[1]!.id);
});
test("a committed response lost in transit retries the same mutation and audit once", async ({
  page,
}) => {
  const g = individual("Pessoa retry confirmação"),
    uid = actor();
  const calls = await backend(page, uid, { commitThenFail: true });
  await loginName(page, g.name);
  await fill(page, "Nome retry conferido");
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page).getByRole("alert")).toBeVisible();
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  const sent = calls.filter((c) => c.type === "PROFILE_CONFIRM");
  expect(sent.length).toBe(2);
  expect(sent[0]!.id).toBe(sent[1]!.id);
  expect(
    db
      .sql(
        `select count(*) from audit_logs where entity_id='${g.id}' and action='PROFILE_CONFIRM';`,
      )
      .trim(),
  ).toBe("1");
});
test("family asks explicitly, confirms one member and persists the declared selection", async ({
  page,
  browser,
}) => {
  const f = action("INVITATION_SAVE", {
    name: "Unidade confirmação",
    pin: "4778",
  });
  action("CODE_ROTATE", { id: f.id, version: 1 });
  const first = individual("Primeira integrante confirmação"),
    second = individual("Segunda integrante confirmação");
  const s = db.rpc(admin, "app_snapshot", { p_event: event });
  action("FAMILY_ADD_MEMBERS", {
    target_id: f.id,
    target_version: 2,
    guests: [first, second].map((g) => ({
      id: g.id,
      version: s.guests.find((x: { id: string }) => x.id === g.id).version,
      invitation_version: s.invitations.find(
        (x: { id: string }) => x.id === g.invitation_id,
      ).version,
    })),
  });
  const uid = actor();
  await backend(page, uid);
  await loginName(page, second.name);
  const identify = page.getByRole("dialog", {
    name: "Quem está usando este convite?",
    exact: true,
  });
  await expect(identify).toBeVisible();
  await expect(identify.getByLabel("E-mail", { exact: true })).toHaveCount(0);
  await identify
    .getByRole("button", { name: second.name, exact: true })
    .click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).getByLabel("Nome completo")).toHaveValue(
    second.name,
  );
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const current = db.rpc(uid, "app_snapshot", { p_event: event });
  expect(
    current.guests.find((g: { id: string }) => g.id === second.id)
      .profile_confirmed_at,
  ).toBeTruthy();
  expect(
    current.guests.find((g: { id: string }) => g.id === first.id)
      .profile_confirmed_at,
  ).toBeNull();
  const another = await browser.newContext({
    baseURL: "http://127.0.0.1:8083",
  });
  const fresh = await another.newPage();
  await backend(fresh, actor());
  await loginName(fresh, second.name);
  const picker = fresh.getByRole("dialog", {
    name: "Quem está usando este convite?",
    exact: true,
  });
  await picker.getByRole("button", { name: second.name, exact: true }).click();
  await expect(fresh.getByRole("dialog")).toHaveCount(0);
  await expect(
    fresh.getByRole("link", { name: "Perfil", exact: true }),
  ).toBeVisible();
  await another.close();
});
test("legacy backend never loops and pending confirmation preserves recovery and real logout", async ({
  page,
}) => {
  const g = individual("Pessoa legado confirmação"),
    uid = actor();
  await backend(page, uid, { legacy: true });
  await loginName(page, g.name);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/rest/v1/rpc/*");
  await backend(page, uid);
  await page.reload();
  await expect(modal(page)).toBeVisible();
  await expect(
    modal(page).getByRole("button", {
      name: "Carregar dados novamente",
      exact: true,
    }),
  ).toBeVisible();
  await modal(page)
    .getByRole("button", { name: "Sair deste convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByLabel("Nome do convidado", { exact: true }),
  ).toBeVisible();
});

test("standalone and logout/new login keep the server confirmation without a browser-only flag", async ({
  page,
  browser,
}) => {
  const g = individual("Pessoa PWA confirmação");
  await backend(page, actor());
  await loginName(page, g.name);
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await loginName(page, g.name);
  await expect(modal(page)).toHaveCount(0);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8083",
  });
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      const media = original(q);
      if (q === "(display-mode: standalone)")
        Object.defineProperty(media, "matches", { value: true });
      return media;
    };
  });
  const second = await context.newPage();
  await backend(second, actor());
  await loginName(second, g.name);
  await expect(modal(second)).toHaveCount(0);
  await expect(
    second.getByRole("button", { name: "Baixar app", exact: true }),
  ).toHaveCount(0);
  await context.close();
});

test("two sessions confirming concurrently preserve one atomic winner and one audit", async () => {
  const g = individual("Pessoa concorrência confirmação"),
    a = actor(),
    b = actor();
  db.sql(
    `insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('${event}','${a}','${g.invitation_id}',now()),('${event}','${b}','${g.invitation_id}',now());`,
  );
  const snap = db.rpc(a, "app_snapshot", { p_event: event });
  const payload = {
    guest_id: g.id,
    name: "Confirmação concorrente",
    whatsapp: "62999994778",
    email: "parallel@example.test",
    version: snap.guests[0].version,
    contact_updated_at: snap.contacts[0].updated_at,
  };
  const { spawn } = await import("node:child_process");
  const run = (uid: string) =>
    new Promise<string>((resolve, reject) => {
      const input = `begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';select app_mutate('${event}','${randomUUID()}','PROFILE_CONFIRM','${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb);select pg_sleep(0.1);commit;`;
      const command = db.ci ? "sudo" : "docker";
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
      const child = spawn(command, args);
      let out = "",
        error = "";
      child.stdout.on("data", (v) => (out += v));
      child.stderr.on("data", (v) => (error += v));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(out) : reject(Error(error)),
      );
      child.stdin.end(input);
    });
  const answers = (await Promise.all([run(a), run(b)])).map((s) =>
    JSON.parse(s.split("\n").find((l) => l.startsWith("{"))!),
  );
  expect(answers[0].confirmed_at).toBe(answers[1].confirmed_at);
  expect(
    db
      .sql(
        `select count(*) from audit_logs where entity_id='${g.id}' and action='PROFILE_CONFIRM';`,
      )
      .trim(),
  ).toBe("1");
  expect(db.rpc(b, "app_snapshot", { p_event: event }).guests[0].version).toBe(
    payload.version + 1,
  );
});

test("pending contact sync cannot be overtaken and logout never silently discards the old queue", async ({
  page,
}) => {
  const g = individual("Pessoa fila confirmação"),
    uid = actor(),
    opts = { failContact: true };
  const calls = await backend(page, uid, opts);
  await loginName(page, g.name);
  await expect(modal(page)).toBeVisible();
  await page.evaluate(
    ({ event, uid, gid, id }) =>
      localStorage.setItem(
        `queue:${event}:${uid}`,
        JSON.stringify([
          {
            mutationId: id,
            type: "CONTACT_UPDATE",
            payload: {
              guest_id: gid,
              email: "queued@example.test",
              whatsapp: "62999994778",
              communications_revoked: true,
            },
            createdAt: new Date().toISOString(),
            attempts: 1,
            lastError: "Pending fixture",
          },
        ]),
      ),
    { event, uid, gid: g.id, id: randomUUID() },
  );
  await page.reload();
  await expect(modal(page)).toBeVisible();
  await fill(page, "Nome fila conferido");
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(
    modal(page).getByText(/Há uma alteração de contato pendente/),
  ).toBeVisible();
  expect(calls.filter((c) => c.type === "PROFILE_CONFIRM")).toHaveLength(0);
  await modal(page)
    .getByRole("button", { name: "Sair deste convite", exact: true })
    .click();
  const warning = page.getByRole("dialog", {
    name: "Sair deste convite?",
    exact: true,
  });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    await page.evaluate(
      ({ event, uid }) =>
        JSON.parse(localStorage.getItem(`queue:${event}:${uid}`) || "[]")
          .length,
      { event, uid },
    ),
  ).toBe(1);
  opts.failContact = false;
  await modal(page)
    .getByRole("button", {
      name: "Sincronizar alterações pendentes",
      exact: true,
    })
    .click();
  await expect(modal(page).getByLabel("E-mail", { exact: true })).toHaveValue(
    "queued@example.test",
  );
  await fill(page, "Nome fila conferido");
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  expect(
    db.rpc(uid, "app_snapshot", { p_event: event }).contacts[0]
      .communications_revoked,
  ).toBe(true);
});

test("Wedding party uses real authenticated PostgreSQL RPCs and completion persists across two devices", async ({
  page,
  browser,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const g = individual("Padrinho PostgreSQL exclusivo"),
    uid = actor(),
    otherDevice = actor();
  db.sql(
    `update guests set profile_confirmed_at=clock_timestamp() where id='${g.id}';`,
  );
  const p = db.rpc(admin, "wedding_party_admin_save_details", {
    p_event: event,
    p_guest: g.id,
    p_role: "PADRINHO",
    p_expected_cycle: null,
    p_message:
      "Mensagem individual do PostgreSQL.\n\nSegundo parágrafo preservado.",
    p_expected_message: null,
    p_display_name: "Meu querido amigo",
    p_expected_display_name: null,
  });
  const before = db.rpc(admin, "app_snapshot", { p_event: event }).rsvps;
  await backend(page, uid);
  await loginName(page, g.name);
  await expect(page).toHaveURL(/padrinhos\?surpresa=1/);
  await page
    .getByRole("button", { name: "Abrir convite especial", exact: true })
    .press("Enter");
  await expect(page.locator("[data-party-paper] strong")).toHaveText([
    "Meu querido amigo",
    "Meu querido amigo",
  ]);
  await expect(
    page.getByText("Mensagem individual do PostgreSQL.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "💙 É claro que aceito!", exact: true })
    .click();
  await expect(
    page.getByText("Agora é oficial!", { exact: true }),
  ).toBeVisible();
  expect(
    db.rpc(uid, "wedding_party_state", { p_event: event }).promotion
      .completed_at,
  ).toBeNull();
  await page
    .getByRole("button", {
      name: "Conhecer minha área especial →",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "O grande dia", exact: true }),
  ).toBeVisible();
  const persisted = db.rpc(uid, "wedding_party_state", {
    p_event: event,
  }).promotion;
  expect(persisted.completed_at).toBeTruthy();
  const device = await browser.newContext();
  try {
    const second = await device.newPage();
    await backend(second, otherDevice);
    await loginName(second, g.name);
    await expect(second).toHaveURL(/\/inicio$/);
    await expect(
      second.getByRole("button", { name: "Espaço dos Padrinhos", exact: true }),
    ).toBeVisible();
    await expect(
      second.getByRole("button", {
        name: "Abrir convite especial",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      db.rpc(otherDevice, "wedding_party_state", { p_event: event }).promotion
        .completed_at,
    ).toBe(persisted.completed_at);
    const edited = db.rpc(admin, "wedding_party_admin_save_details", {
      p_event: event,
      p_guest: g.id,
      p_role: "PADRINHO",
      p_expected_cycle: p.cycle_id,
      p_message: persisted.personal_message,
      p_expected_message: persisted.personal_message,
      p_display_name: null,
      p_expected_display_name: "Meu querido amigo",
    });
    expect(edited.cycle_id).toBe(p.cycle_id);
    expect(edited.completed_at).toBe(persisted.completed_at);
    await second.emulateMedia({ reducedMotion: "reduce" });
    await second.goto("/padrinhos");
    await second
      .getByRole("button", { name: "Rever a surpresa ↺", exact: true })
      .click();
    await second
      .getByRole("button", { name: "Abrir convite especial", exact: true })
      .click();
    await expect(second.locator("[data-party-paper] strong")).toHaveText([
      "Padrinho",
      "Padrinho",
    ]);
    db.rpc(admin, "wedding_party_admin_set", {
      p_event: event,
      p_guest: g.id,
      p_role: null,
      p_expected_cycle: p.cycle_id,
    });
    await second.goto("/padrinhos?pagina=recado");
    await expect(second).toHaveURL(/\/inicio$/);
    expect(db.rpc(admin, "app_snapshot", { p_event: event }).rsvps).toEqual(
      before,
    );
  } finally {
    await device.close();
  }
});

test("exclusive link responsible identity PostgreSQL authorization matrix", () => {
  expect(
    db.sql(readFileSync("tests/link-responsible-identity.sql", "utf8")),
  ).toContain("Link responsible identity:");
});

function responsibleFamily(label: string) {
  // The responsible is deliberately not the first member created.
  const first = individual(`Outro integrante ${label}`);
  const responsible = individual(`Responsável ${label}`);
  const family = action("INVITATION_SAVE", {
    name: `Família ${label}`,
    pin: "4778",
  });
  action("CODE_ROTATE", { id: family.id, version: 1 });
  const initial = db.rpc(admin, "app_snapshot", { p_event: event });
  action("FAMILY_ADD_MEMBERS", {
    target_id: family.id,
    target_version: 2,
    guests: [first, responsible].map((g) => ({
      id: g.id,
      version: initial.guests.find((x: { id: string }) => x.id === g.id)
        .version,
      invitation_version: initial.invitations.find(
        (x: { id: string }) => x.id === g.invitation_id,
      ).version,
    })),
  });
  let snapshot = db.rpc(admin, "app_snapshot", { p_event: event });
  let unit = snapshot.invitations.find(
    (i: { id: string }) => i.id === family.id,
  );
  action("INVITATION_SAVE", {
    id: family.id,
    version: unit.version,
    name: unit.name,
    active: true,
    primary_guest_id: responsible.id,
  });
  snapshot = db.rpc(admin, "app_snapshot", { p_event: event });
  unit = snapshot.invitations.find((i: { id: string }) => i.id === family.id);
  action("CODE_ROTATE", { id: family.id, version: unit.version });
  snapshot = db.rpc(admin, "app_snapshot", { p_event: event });
  unit = snapshot.invitations.find((i: { id: string }) => i.id === family.id);
  // Already confirmed fixture: identity recovery must not demand another form.
  db.sql(
    `update guests set profile_confirmed_at=now() where id='${responsible.id}';`,
  );
  return { first, responsible, unit };
}
for (const width of [320, 1280]) {
  test(`exclusive family link enters directly as registered responsible at ${width}px`, async ({
    page,
    browser,
  }) => {
    const f = responsibleFamily(`link ${width}`),
      uid = actor();
    await backend(page, uid);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      (window as unknown as { memberPickerSeen: boolean }).memberPickerSeen =
        false;
      new MutationObserver(() => {
        if (
          document.body?.textContent?.includes("Quem está usando este convite?")
        )
          (
            window as unknown as { memberPickerSeen: boolean }
          ).memberPickerSeen = true;
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await page.goto(`/c/${f.unit.sharing_code}`);
    await page.getByLabel("Senha de acesso", { exact: true }).fill("4778");
    await page
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(
      page.getByRole("dialog", {
        name: "Quem está usando este convite?",
        exact: true,
      }),
    ).toHaveCount(0);
    const current = () => db.rpc(uid, "app_snapshot", { p_event: event });
    expect(current().profile_confirmation.guest_id).toBe(f.responsible.id);
    expect(current().guests).toHaveLength(2);
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Perfil", exact: true }),
    ).toBeVisible();
    expect(current().profile_confirmation.guest_id).toBe(f.responsible.id);
    // Old, already verified link sessions recover without asking for a PIN again.
    db.sql(
      `update invitation_sessions set profile_guest_id=null where event_id='${event}' and user_id='${uid}';`,
    );
    await page.goto(`/c/${f.unit.sharing_code}`);
    await expect(page).toHaveURL(/\/inicio$/);
    expect(current().profile_confirmation.guest_id).toBe(f.responsible.id);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { memberPickerSeen: boolean }).memberPickerSeen,
      ),
    ).toBe(false);
    expect(
      current().rsvps.every((r: { status: string }) => r.status === "PENDING"),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Ver meus convites", exact: true }),
    ).toBeVisible();
    // A separate anonymous session gets the same real responsible, never roster order.
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:8083",
      viewport: { width, height: 844 },
    });
    const fresh = await context.newPage(),
      secondUid = actor();
    await backend(fresh, secondUid);
    await fresh.goto(`/c/${f.unit.sharing_code}`);
    await fresh.getByLabel("Senha de acesso", { exact: true }).fill("4778");
    await fresh
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(fresh).toHaveURL(/\/inicio$/);
    await expect(fresh.getByRole("dialog")).toHaveCount(0);
    expect(
      db.rpc(secondUid, "app_snapshot", { p_event: event }).profile_confirmation
        .guest_id,
    ).toBe(f.responsible.id);
    await context.close();
  });
}

test("unconfirmed link responsible opens their own form without a member picker", async ({
  page,
}) => {
  const f = responsibleFamily("cadastro pendente"),
    uid = actor();
  db.sql(
    `update guests set profile_confirmed_at=null where id='${f.responsible.id}';`,
  );
  await backend(page, uid);
  await page.goto(`/c/${f.unit.sharing_code}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("4778");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(
    page.getByRole("dialog", {
      name: "Quem está usando este convite?",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    modal(page).getByLabel("Nome completo", { exact: true }),
  ).toHaveValue(f.responsible.name);
  await modal(page)
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  const snapshot = db.rpc(uid, "app_snapshot", { p_event: event });
  expect(
    snapshot.guests.find((g: { id: string }) => g.id === f.first.id)
      .profile_confirmed_at,
  ).toBeNull();
  expect(
    snapshot.rsvps.every((r: { status: string }) => r.status === "PENDING"),
  ).toBe(true);
});

test("link without a valid responsible keeps the safe member selection", async ({
  page,
}) => {
  const f = responsibleFamily("sem responsável"),
    uid = actor();
  db.sql(
    `update invitations set primary_guest_id=null where id='${f.unit.id}';`,
  );
  await backend(page, uid);
  await page.goto(`/c/${f.unit.sharing_code}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("4778");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  const picker = page.getByRole("dialog", {
    name: "Quem está usando este convite?",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: f.first.name, exact: true }).click();
  await expect(
    modal(page).getByLabel("Nome completo", { exact: true }),
  ).toHaveValue(f.first.name);
  expect(
    db.rpc(uid, "app_snapshot", { p_event: event }).profile_confirmation
      .guest_id,
  ).toBe(f.first.id);
});
