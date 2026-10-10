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
