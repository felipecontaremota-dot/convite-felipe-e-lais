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
        name === "redeem_invitation" ||
        name === "redeem_invitation_password"
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
  await expect(
    page.getByText(
      "Estado confirmado: comunicações conforme os consentimentos autorizados.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Alteração pendente de confirmação do servidor. O estado remoto mantém a confirmação anterior.",
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

test("public password-only entry binds the correct real access and never exposes other guests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("Um novo capítulo, juntos.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nossa próxima aventura", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Código do convite", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Voltar", exact: true }),
  ).toHaveCount(0);
  const submit = page.getByRole("button", {
    name: "Abrir convite",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await expect(page.getByTestId("wedding-countdown")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Acesso dos noivos e cerimonial",
      exact: true,
    }),
  ).toBeVisible();
  const responses: object[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/functions/v1/redeem-invitation"))
      void response.json().then((data) => responses.push(data));
  });
  await page.getByLabel("Senha do convite", { exact: true }).fill("9999");
  await submit.click();
  await expect(
    page.getByText("Senha inválida.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pessoa CORS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Família CORS", { exact: true })).toHaveCount(0);
  await page.getByLabel("Senha do convite", { exact: true }).fill("0047");
  await submit.click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(
    page.getByText("Boas-vindas, Pessoa CORS", { exact: true }),
  ).toBeVisible();
  expect(responses).toEqual([{ code: "invalid_password" }, { linked: true }]);
  await page.reload();
  await expect(
    page.getByText("Boas-vindas, Pessoa CORS", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page.getByText("Família CORS", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Profile persistence failure never presents an effective remote revocation, including reload", async ({
  page,
}) => {
  db.rpc(admin, "app_mutate", {
    p_event: event,
    p_mutation: crypto.randomUUID(),
    p_type: "CONTACT_UPDATE",
    p_payload: { guest_id: individualId, communications_revoked: false },
  });
  await page.goto(`/c/${code}`);
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await page.route("**/rest/v1/rpc/app_mutate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        code: "fixture_failure",
        message: "Fixture persistence unavailable",
      }),
    }),
  );
  await page
    .getByRole("checkbox", {
      name: "Revogar permissão de receber mensagens e notificações",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Salvar contato de Pessoa CORS", exact: true })
    .click();
  await expect(
    page.getByText(
      "Salvo neste dispositivo. A sincronização falhou; tente novamente.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Estado confirmado: comunicações conforme os consentimentos autorizados.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Estado confirmado: comunicações revogadas.", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    db
      .sql(
        `select communications_revoked from guest_contacts where guest_id='${individualId}';`,
      )
      .trim(),
  ).toBe("f");
  await page.reload();
  await expect(
    page.getByText(
      "Estado confirmado: comunicações conforme os consentimentos autorizados.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Alteração pendente de confirmação do servidor. O estado remoto mantém a confirmação anterior.",
      { exact: true },
    ),
  ).toBeVisible();
});
