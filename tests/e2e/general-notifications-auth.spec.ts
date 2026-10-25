import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/postgres";
import { ticketFixture } from "../support/ticket-fixture";
const db = new TestPostgres();
let f: ReturnType<typeof ticketFixture>;
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  f = ticketFixture(db);
});
test.afterAll(() => db.stop());
async function backend(
  page: Page,
  uid: string,
  options = { loseReply: false },
) {
  const exp = Math.floor(Date.now() / 1000) + 3600,
    enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    is_anonymous: uid !== f.admin,
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    try {
      if (path.startsWith("/auth/"))
        data = path.endsWith("/user") ? user : session;
      else if (path.startsWith("/rest/v1/rpc/")) {
        data = db.rpc(uid, path.split("/").at(-1)!, args);
        if (args.p_action === "NOTIFICATION_PUBLISH" && options.loseReply) {
          options.loseReply = false;
          throw Error("Fixture: committed reply lost");
        }
      } else if (path === "/functions/v1/dispatch-notifications")
        data = {
          results: [
            {
              channel: "EMAIL",
              status: "skipped",
              reason: "Fixture sem envio externo",
            },
          ],
        };
      else if (path === "/functions/v1/redeem-invitation") {
        const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
        data = JSON.parse(
          db
            .sql(
              `begin;set local role service_role;select redeem_invitation_by_name(${[f.event, uid, args.name, args.pin, "notification-fixture"].map(q).join(",")});commit;`,
            )
            .trim(),
        );
      }
    } catch {
      status = 400;
      data = { message: "Operação não autorizada ou inválida.", code: "P0001" };
    }
    await route.fulfill({ status, json: data });
  });
}
test("real PostgreSQL publication, external-only feed, consent and family read persist through reload", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await backend(page, f.admin, { loseReply: true });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Notificações", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova notificação", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Nova notificação",
    exact: true,
  });
  await editor
    .getByLabel("Título", { exact: true })
    .fill("Publicação real SQL 💙");
  await editor
    .getByLabel("Mensagem", { exact: true })
    .fill("Parágrafo 1.\n\nParágrafo 2.");
  await editor.getByRole("checkbox", { name: "IN_APP", exact: true }).click();
  await editor.getByRole("checkbox", { name: "EMAIL", exact: true }).click();
  await editor
    .getByRole("button", { name: "Revisar notificação", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirmar notificação", exact: true })
    .getByRole("button", { name: "Publicar e enviar", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirmar notificação",
    exact: true,
  });
  await expect(confirmation.getByRole("alert").last()).toContainText(
    "Não foi possível",
  );
  expect(
    db
      .sql("select count(*) from messages where published_at is not null;")
      .trim(),
  ).toBe("1");
  await confirmation
    .getByRole("button", { name: "Publicar e enviar", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(
    db
      .sql("select count(*) from messages where published_at is not null;")
      .trim(),
  ).toBe("1");
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await context.newPage();
  try {
    await backend(guest, f.owner);
    await guest.goto("http://127.0.0.1:8083/");
    await guest.getByLabel("Nome do convidado", { exact: true }).fill(f.a.name);
    await guest.getByLabel("Senha do convite", { exact: true }).fill("1234");
    await guest
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(guest).toHaveURL(/\/inicio$/);
    await expect(
      guest.getByText("Publicação real SQL 💙", { exact: true }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Marcar recado como lido", exact: true })
      .click();
    await guest.reload();
    await expect(guest.getByText("Lido", { exact: true })).toBeVisible();
    expect(
      db
        .sql(
          "select count(*) from message_reads where reader_key like 'unit:%';",
        )
        .trim(),
    ).toBe("1");
    const keep = randomUUID();
    f.action("NOTIFICATION_PUBLISH", {
      id: keep,
      audience: "GENERAL",
      title: "Outra notificação preservada",
      body: "Não remover.",
      channels: ["IN_APP"],
    });
    await page.reload();
    const trash = page.getByRole("button", {
      name: "Excluir notificação: Publicação real SQL 💙",
      exact: true,
    });
    await trash.click();
    let confirmation = page.getByRole("dialog", {
      name: "Excluir notificação?",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await expect(trash).toBeVisible();
    await trash.click();
    confirmation = page.getByRole("dialog", {
      name: "Excluir notificação?",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Excluir notificação", exact: true })
      .click();
    await expect(trash).toHaveCount(0);
    await expect(page.getByText(/Excluída em /)).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByText("Publicação real SQL 💙", { exact: true }),
    ).toHaveCount(0);
    await expect(
      guest.getByText("Outra notificação preservada", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: /Excluir notificação/ }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "/tmp/notification-deleted-admin.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("deletion invalidates already loaded older pages and never returns through pagination", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const target = randomUUID();
  f.action("NOTIFICATION_PUBLISH", {
    id: target,
    audience: "GENERAL",
    title: "Recado antigo para excluir",
    body: "Histórico paginado.",
    channels: ["IN_APP"],
  });
  db.sql(
    `update messages set published_at=now()-interval '2 days' where id='${target}';insert into messages(event_id,thread_id,from_admin,content,notification_title,audience,published_at,notification_origin) select '${f.event}',(select id from message_threads limit 1),true,'Página preservada','Página '||n,'GENERAL',now()+n*interval '1 second','MANUAL' from generate_series(1,25)n;`,
  );
  await backend(page, f.owner);
  await page.goto("/");
  await page.getByLabel("Nome do convidado", { exact: true }).fill(f.a.name);
  await page.getByLabel("Senha do convite", { exact: true }).fill("1234");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page
    .getByRole("button", { name: "Carregar recados anteriores", exact: true })
    .click();
  await expect(
    page.getByText("Recado antigo para excluir", { exact: true }),
  ).toBeVisible();
  f.action("NOTIFICATION_DELETE", { id: target });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Recado antigo para excluir", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  await page
    .getByRole("button", { name: "Carregar recados anteriores", exact: true })
    .click();
  await expect(
    page.getByText("Recado antigo para excluir", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Outra notificação preservada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Carregar recados anteriores", exact: true })
    .click();
  await expect(
    page.getByText("Recado antigo para excluir", { exact: true }),
  ).toHaveCount(0);
  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await backend(second, f.secondDevice);
    await second.goto("http://127.0.0.1:8083/");
    await second
      .getByLabel("Nome do convidado", { exact: true })
      .fill(f.a.name);
    await second.getByLabel("Senha do convite", { exact: true }).fill("1234");
    await second
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(second).toHaveURL(/\/inicio$/);
    await second
      .getByRole("button", { name: "Carregar recados anteriores", exact: true })
      .click();
    await expect(
      second.getByText("Recado antigo para excluir", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
