import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres(),
  event = "00000000-0000-4000-8000-000000000001",
  admin = "bcbcbcbc-0000-4000-8000-000000000001";
let bridge: Server, edge: ChildProcess;
let code = "",
  familyCode = "",
  individualId = "",
  familyId = "";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${admin}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
  );
  const action = (p_action: string, p_payload: object) =>
    db.rpc(admin, "admin_action", { p_event: event, p_action, p_payload });
  const individual = action("GUEST_CREATE", {
    name: "Pessoa CORS",
    whatsapp: "62999990047",
  });
  individualId = individual.id;
  const family = action("INVITATION_SAVE", {
    name: "Família CORS",
    pin: "1234",
  });
  familyId = family.id;
  action("CODE_ROTATE", { id: familyId, version: 1 });
  const snapshot = db.rpc(admin, "app_snapshot", { p_event: event });
  code = snapshot.invitations.find(
    (i: { id: string }) => i.id === individual.invitation_id,
  ).sharing_code;
  familyCode = snapshot.invitations.find(
    (i: { id: string }) => i.id === familyId,
  ).sharing_code;
  bridge = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const { name, args, uid } = JSON.parse(Buffer.concat(chunks).toString());
    let data: unknown,
      error: unknown = null;
    try {
      if (name === "fixture_user") {
        if (!/^[a-f0-9-]{36}$/.test(args.id)) throw Error("invalid fixture");
        db.sql(
          `insert into auth.users(id,is_anonymous) values('${args.id}',true);`,
        );
        data = true;
      } else if (
        name === "identify_invitation" ||
        name === "redeem_invitation"
      ) {
        const value = db
          .sql(
            `set role service_role;select ${name}(${Object.entries(args)
              .map(
                ([key, v]) => `${key} => '${String(v).replaceAll("'", "''")}'`,
              )
              .join(",")});`,
          )
          .trim();
        data =
          value === "t"
            ? true
            : value === "f"
              ? false
              : value
                ? JSON.parse(value)
                : null;
      } else data = db.rpc(uid, name, args);
    } catch {
      error = { message: "Fixture backend failed", code: "P0001" };
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data, error }));
  });
  await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  const address = bridge.address() as { port: number };
  edge = spawn(
    "node_modules/.bin/deno",
    [
      "run",
      "--config",
      "supabase/functions/deno.json",
      "--allow-env",
      "--allow-net",
      "tests/support/edge-fixture.ts",
    ],
    {
      env: {
        ...process.env,
        DENO_DIR: process.env.DENO_DIR || "/tmp/wedding-deno",
        TEST_RPC_BRIDGE: `http://127.0.0.1:${address.port}`,
      },
      stdio: "pipe",
    },
  );
  let logs = "";
  edge.stderr?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  await expect
    .poll(
      async () => {
        if (edge.exitCode !== null) throw Error(logs);
        try {
          return (await fetch("http://127.0.0.1:54321/fixture/stats")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 60000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  edge?.kill();
  await new Promise<void>((resolve) =>
    bridge ? bridge.close(() => resolve()) : resolve(),
  );
  db.stop();
});
test("ADMIN copies links without invoking access; new anonymous browser passes real CORS for individual and FAMILY", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  const before = await (
    await fetch("http://127.0.0.1:54321/fixture/stats")
  ).json();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page
    .getByRole("button", { name: "Abrir ficha de Pessoa CORS", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Pessoa CORS", exact: true });
  await expect(modal.getByText(/https:\/\/example\.test/)).toHaveCount(0);
  await modal.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(modal.getByText("Link copiado.", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toBe(`https://example.test/c/${code}`);
  await modal
    .getByRole("button", { name: "Copiar link + senha", exact: true })
    .click();
  await expect(
    modal.getByText("Link e senha copiados.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toBe(`https://example.test/c/${code}\nSenha: 0047`);
  await modal.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("link", { name: "Famílias", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar família Família CORS", exact: true })
    .click();
  const familyModal = page.getByRole("dialog", {
    name: "Editar família — Família CORS",
    exact: true,
  });
  await familyModal
    .getByRole("button", { name: "Copiar link", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toBe(`https://example.test/c/${familyCode}`);
  await familyModal
    .getByRole("button", { name: "Copiar link + senha", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toBe(`https://example.test/c/${familyCode}\nSenha: 1234`);
  expect(
    await (await fetch("http://127.0.0.1:54321/fixture/stats")).json(),
  ).toEqual(before);
  for (const [link, name, pin] of [
    [code, "Pessoa CORS", "0047"],
    [familyCode, "Família CORS", "1234"],
  ]) {
    const context = await browser.newContext({
        baseURL: "http://127.0.0.1:8083",
      }),
      guest = await context.newPage();
    await guest.goto(`/c/${link}`);
    await expect(
      guest.getByText(`Olá, ${name}!`, { exact: true }),
    ).toBeVisible();
    await expect(guest.getByRole("alert")).toHaveCount(0);
    await guest.getByLabel("Senha de acesso", { exact: true }).fill("9999");
    await guest
      .getByRole("button", { name: "Abrir nosso convite", exact: true })
      .click();
    await expect(
      guest.getByText("Senha inválida.", { exact: true }),
    ).toBeVisible();
    await guest.getByLabel("Senha de acesso", { exact: true }).fill(pin);
    await guest
      .getByRole("button", { name: "Abrir nosso convite", exact: true })
      .click();
    await expect(guest).toHaveURL(/\/inicio$/);
    await context.close();
  }
  const after = await (
    await fetch("http://127.0.0.1:54321/fixture/stats")
  ).json();
  expect(after.options).toBeGreaterThan(0);
  expect(after.posts).toBeGreaterThanOrEqual(6);
  expect(
    db
      .sql(
        `select count(*) from invitation_sessions where invitation_id in ('${familyId}',(select invitation_id from guests where id='${individualId}'));`,
      )
      .trim(),
  ).toBe("2");
});
test("blocked links, administrative session and real network failure are distinguished", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto(`/c/${code}`);
  await expect(
    page.getByText(
      "Você está conectado em uma conta administrativa. Saia dessa conta ou abra o convite em outro navegador/dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/painel");
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  db.rpc(admin, "admin_action", {
    p_event: event,
    p_action: "CODE_BLOCK",
    p_payload: { id: familyId, version: 2 },
  });
  await page.goto(`/c/${familyCode}`);
  await expect(
    page.getByText("Este link de convite é inválido ou não está mais ativo.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/functions/v1/redeem-invitation", (route) =>
    route.abort("failed"),
  );
  await page.goto(`/c/${code}`);
  await expect(
    page.getByText(
      "Não foi possível carregar o convite agora. Tente novamente.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Senha inválida.", { exact: true })).toHaveCount(
    0,
  );
});

test("browser reproduces original missing x-client-info CORS: OPTIONS arrives but POST is blocked with technical feedback", async ({
  browser,
}) => {
  const before = await (
    await fetch("http://127.0.0.1:54321/fixture/stats")
  ).json();
  await fetch("http://127.0.0.1:54321/fixture/cors", {
    method: "POST",
    body: JSON.stringify({ broken: true }),
  });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8083",
  });
  try {
    const guest = await context.newPage();
    await guest.goto(`/c/${code}`);
    await expect(
      guest.getByText(
        "Não foi possível carregar o convite agora. Tente novamente.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      guest.getByText("Senha inválida.", { exact: true }),
    ).toHaveCount(0);
    const after = await (
      await fetch("http://127.0.0.1:54321/fixture/stats")
    ).json();
    expect(after.options).toBeGreaterThan(before.options);
    expect(after.posts).toBe(before.posts);
  } finally {
    await context.close();
    await fetch("http://127.0.0.1:54321/fixture/cors", {
      method: "POST",
      body: JSON.stringify({ broken: false }),
    });
  }
});

test("Profile real database: offline revocation, reload and reactivation preserve prior channels without duplicate operations", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  db.rpc(admin, "app_mutate", {
    p_event: event,
    p_mutation: "bcbcbcbc-8000-4000-8000-000000000001",
    p_type: "CONTACT_UPDATE",
    p_payload: {
      guest_id: individualId,
      email: "profile@example.test",
      whatsapp: "62999990047",
      consent_in_app: true,
      consent_email: true,
      consent_whatsapp: true,
      consent_push: false,
    },
  });
  db.rpc(admin, "app_mutate", {
    p_event: event,
    p_mutation: "bcbcbcbc-8000-4000-8000-000000000002",
    p_type: "RSVP_UPDATE",
    p_payload: { guest_id: individualId, status: "CONFIRMED" },
  });
  const contact = () =>
    JSON.parse(
      db.sql(
        `select jsonb_build_object('revoked',communications_revoked,'phone',whatsapp,'channels',jsonb_build_array(consent_in_app,consent_email,consent_whatsapp,consent_push)) from guest_contacts where guest_id='${individualId}';`,
      ),
    );
  const receipts = () =>
    Number(
      db.sql(
        `select count(*) from mutation_receipts where event_id='${event}' and user_id in(select user_id from invitation_sessions where invitation_id=(select invitation_id from guests where id='${individualId}'));`,
      ),
    );
  await page.goto(`/c/${code}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  const qr = page.getByLabel("Convite individual de Pessoa CORS", {
    exact: true,
  });
  await expect(qr.locator("svg")).toBeVisible();
  const originalQr = db
    .sql(
      `select token_hash from qr_credentials where guest_id='${individualId}' and revoked_at is null;`,
    )
    .trim();
  await page.reload();
  await expect(qr.locator("svg")).toBeVisible();
  expect(
    db
      .sql(
        `select token_hash from qr_credentials where guest_id='${individualId}' and revoked_at is null;`,
      )
      .trim(),
  ).toBe(originalQr);
  expect(
    db
      .sql(
        `select sharing_code from invitation_access where invitation_id=(select invitation_id from guests where id='${individualId}');`,
      )
      .trim(),
  ).toBe(code);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  const checkbox = page.getByRole("checkbox", {
    name: "Revogar permissão de receber mensagens e notificações",
    exact: true,
  });
  const save = page.getByRole("button", {
    name: "Salvar contato de Pessoa CORS",
    exact: true,
  });
  await expect(checkbox).not.toBeChecked();
  const before = receipts();
  await context.setOffline(true);
  await expect(
    page.getByText(/Sem conexão/).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByLabel("WhatsApp de Pessoa CORS", { exact: true })
    .fill("62912345678");
  await checkbox.check();
  await save.click();
  await expect(
    page.getByText(
      "Salvo neste dispositivo. Será sincronizado quando houver conexão.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(contact()).toEqual({
    revoked: false,
    phone: "62999990047",
    channels: [true, true, true, false],
  });
  await context.setOffline(false);
  await expect
    .poll(() => contact())
    .toEqual({
      revoked: true,
      phone: "62912345678",
      channels: [true, true, true, false],
    });
  await expect.poll(receipts).toBe(before + 1);
  const fresh = await browser.newContext({ baseURL: "http://127.0.0.1:8083" });
  try {
    const guest = await fresh.newPage();
    await guest.goto(`/c/${code}`);
    await guest.getByLabel("Senha de acesso", { exact: true }).fill("0047");
    await guest
      .getByRole("button", { name: "Abrir nosso convite", exact: true })
      .click();
    await expect(guest).toHaveURL(/\/inicio$/);
    await guest.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(
      guest.getByRole("checkbox", {
        name: "Revogar permissão de receber mensagens e notificações",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      guest.getByLabel("WhatsApp de Pessoa CORS", { exact: true }),
    ).toHaveValue("(62) 9 1234-5678");
  } finally {
    await fresh.close();
  }
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await save.click();
  await expect(
    page.getByText("Salvo com sucesso.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => contact())
    .toEqual({
      revoked: false,
      phone: "62912345678",
      channels: [true, true, true, false],
    });
  await page.reload();
  await expect(checkbox).not.toBeChecked();
  expect(receipts()).toBe(before + 2);
});

test("Real family QR: modal isolation, partial offline arrival, individual notification and unchanged access/RSVP", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const action = (p_action: string, p_payload: object) =>
    db.rpc(admin, "admin_action", { p_event: event, p_action, p_payload });
  const family = action("INVITATION_SAVE", {
    name: "Família Portaria",
    primary_name: "Guilherme Portaria",
    pin: "0047",
  });
  action("CODE_ROTATE", { id: family.id, version: 1 });
  const members = ["Maria Portaria", "Pedro Portaria", "João Portaria"].map(
    (name, index) =>
      action("GUEST_SAVE", {
        name,
        invitation_id: family.id,
        is_child: index === 1,
      }).id as string,
  );
  const primary = db
    .sql(`select primary_guest_id from invitations where id='${family.id}';`)
    .trim();
  for (const guest of [primary, ...members])
    db.rpc(admin, "app_mutate", {
      p_event: event,
      p_mutation: crypto.randomUUID(),
      p_type: "RSVP_UPDATE",
      p_payload: { guest_id: guest, status: "CONFIRMED" },
    });
  const access = db
    .sql(
      `select to_jsonb(a) from invitation_access a where invitation_id='${family.id}';`,
    )
    .trim();
  const familyLink = JSON.parse(access).sharing_code;
  const rsvp = db
    .sql(
      `select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r where guest_id in(select id from guests where invitation_id='${family.id}');`,
    )
    .trim();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/c/${familyLink}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  await expect(
    page
      .getByLabel("Convite familiar de Família Portaria", { exact: true })
      .locator("svg"),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Convite individual de Pedro Portaria", { exact: true })
      .locator("svg"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Este é o seu convite individual, use ele para acessar o local no Grande Dia",
      { exact: true },
    ),
  ).toHaveCount(4);
  await expect(
    page.getByLabel(/^Convite individual de /).locator("svg"),
  ).toHaveCount(4);
  const credentials = () =>
    db
      .sql(
        `select jsonb_agg(to_jsonb(c) order by id) from family_qr_credentials c where invitation_id='${family.id}';`,
      )
      .trim();
  const original = credentials();
  let regenerationRequests = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/rpc/issue_family_ticket") &&
      request.postDataJSON()?.p_regenerate === true
    )
      regenerationRequests++;
  });
  const cachedTokens = () =>
    page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("tickets:"),
      ),
    );
  const originalCache = await cachedTokens();
  await page
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .first()
    .click();
  const modal = page.getByRole("dialog", { name: "Confirmação", exact: true });
  await expect(
    modal.getByText(
      "Tem certeza que deseja gerar um novo convite? O antigo será invalidado",
      { exact: true },
    ),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(credentials()).toBe(original);
  expect(regenerationRequests).toBe(0);
  expect(await cachedTokens()).toEqual(originalCache);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .first()
    .click();
  await modal.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    modal.getByText("Conecte-se para gerar um novo convite.", { exact: true }),
  ).toBeVisible();
  expect(credentials()).toBe(original);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page
      .getByLabel("Convite familiar de Família Portaria", { exact: true })
      .locator("svg"),
  ).toBeVisible();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .first()
    .click();
  await modal.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(credentials()).not.toBe(original);
  expect(regenerationRequests).toBe(1);
  const familyAfterRegeneration = credentials();
  const otherIndividualHashes = db
    .sql(
      `select jsonb_agg(token_hash order by guest_id) from qr_credentials where guest_id in ('${primary}','${members[0]}','${members[2]}') and revoked_at is null;`,
    )
    .trim();
  let childRegenerations = 0;
  await page.route("**/rpc/issue_ticket", async (route) => {
    if (route.request().postDataJSON()?.p_regenerate === true) {
      childRegenerations++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });
  await page
    .getByLabel("Convite individual de Pedro Portaria", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "Confirmar", exact: true })
    .dblclick();
  await expect(modal).toHaveCount(0);
  expect(childRegenerations).toBe(1);
  expect(credentials()).toBe(familyAfterRegeneration);
  expect(
    db
      .sql(
        `select jsonb_agg(token_hash order by guest_id) from qr_credentials where guest_id in ('${primary}','${members[0]}','${members[2]}') and revoked_at is null;`,
      )
      .trim(),
  ).toBe(otherIndividualHashes);
  const tokens = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("tickets:"))
      .flatMap(
        (k) =>
          JSON.parse(localStorage.getItem(k)!) as {
            guest_id: string;
            token: string;
          }[],
      ),
  );
  const familyToken = tokens.find(
    (t) => t.guest_id === `family:${family.id}`,
  )!.token;
  const childToken = tokens.find((t) => t.guest_id === members[1])!.token;
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/convites-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "/tmp/convites-desktop.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const staffContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const staff = await staffContext.newPage();
  try {
    await staff.goto("/login");
    await staff
      .getByLabel("E-mail", { exact: true })
      .fill("admin@example.test");
    await staff.getByLabel("Senha", { exact: true }).fill("fixture-password");
    await staff.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(staff).toHaveURL(/\/painel$/);
    await staff
      .getByRole("link", { name: "Dia do evento", exact: true })
      .click();
    const scan = async (token: string) => {
      await staff
        .getByLabel("Token ou conteúdo do QR (entrada acessível)")
        .fill(token);
      await staff
        .getByRole("button", { name: "Validar convite", exact: true })
        .click();
    };
    await scan(`wedding://family-ticket/${familyToken}`);
    await expect(staff.getByRole("checkbox")).toHaveCount(4);
    await scan(`wedding://family-ticket/${"f".repeat(64)}`);
    await expect(
      staff.getByText(
        "Convite familiar inválido, revogado ou ausente no cache.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(staff.getByRole("checkbox")).toHaveCount(0);
    await expect(
      staff.getByRole("button", { name: "Confirmar", exact: true }),
    ).toHaveCount(0);
    expect(
      Number(
        db.sql(
          `select count(*) from checkins where guest_id in(select id from guests where invitation_id='${family.id}');`,
        ),
      ),
    ).toBe(0);
    await scan(`wedding://family-ticket/${familyToken}`);
    await expect(staff.getByRole("checkbox")).toHaveCount(4);
    await staff.screenshot({
      path: "/tmp/conferencia-familiar-mobile.png",
      fullPage: true,
    });
    await expect(
      staff.getByRole("checkbox", { name: "Pedro Portaria", exact: true }),
    ).toBeChecked();
    await staff
      .getByRole("checkbox", { name: "Pedro Portaria", exact: true })
      .click();
    await staff
      .getByRole("checkbox", { name: "João Portaria", exact: true })
      .click();
    await staffContext.setOffline(true);
    await staff.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(
      staff.getByText(
        "Salvo neste dispositivo. Será sincronizado quando houver conexão.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      Number(
        db.sql(
          `select count(*) from checkins where guest_id in(select id from guests where invitation_id='${family.id}');`,
        ),
      ),
    ).toBe(0);
    await staffContext.setOffline(false);
    await expect
      .poll(() =>
        Number(
          db.sql(
            `select count(*) from checkins where guest_id in(select id from guests where invitation_id='${family.id}');`,
          ),
        ),
      )
      .toBe(2);
    await scan(`wedding://ticket/${childToken}`);
    await expect(
      staff.getByText("Convite individual — Pedro Portaria", { exact: true }),
    ).toBeVisible();
    await staff
      .getByRole("button", { name: "Confirmar entrada", exact: true })
      .click();
    await expect
      .poll(() =>
        Number(
          db.sql(
            `select count(*) from messages where recipient_guest_id='${primary}' and content='Pedro Portaria acabou de confirmar presença';`,
          ),
        ),
      )
      .toBe(1);
    await scan(`wedding://family-ticket/${familyToken}`);
    await expect(staff.getByRole("checkbox")).toHaveCount(1);
    await expect(
      staff.getByRole("checkbox", { name: "João Portaria", exact: true }),
    ).toBeChecked();
    await staff.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect
      .poll(() =>
        Number(
          db.sql(
            `select count(*) from checkins where guest_id in(select id from guests where invitation_id='${family.id}');`,
          ),
        ),
      )
      .toBe(4);
    expect(
      db
        .sql(
          `select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r where guest_id in(select id from guests where invitation_id='${family.id}');`,
        )
        .trim(),
    ).toBe(rsvp);
    expect(
      db
        .sql(
          `select to_jsonb(a) from invitation_access a where invitation_id='${family.id}';`,
        )
        .trim(),
    ).toBe(access);
    expect(
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await staffContext.close();
  }
});
