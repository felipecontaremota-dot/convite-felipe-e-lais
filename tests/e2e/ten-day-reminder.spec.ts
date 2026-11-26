import { test, expect, type Page } from "@playwright/test";
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
      } else if (path === "/functions/v1/dispatch-notifications") {
        if (args.ten_day === "IMAGE") {
          db.sql(
            `begin;set local role service_role;select ten_day_email_work('IMAGE','${f.event}',null,null,null,'{"available":false}');commit;`,
          );
          data = { available: false };
        } else data = { status: "accepted" };
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

for (const width of [390, 1280])
  test(`ten-day ADMIN configuration and full fictitious preview at ${width}px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await admin(page);
    await page.getByRole("link", { name: "Notificações", exact: true }).click();
    await expect(
      page.getByText("Lembrete — Faltam 10 dias", { exact: true }),
    ).toBeVisible();
    const field = page.getByLabel("Assunto do e-mail de 10 dias", {
      exact: true,
    });
    await expect(field).toHaveValue(
      "FALTAM APENAS 10 DIAS PARA O NOSSO CASAMENTO 💙💍",
    );
    await page
      .getByRole("button", { name: "Pré-visualizar e-mail de 10 dias" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Prévia fictícia — Faltam 10 dias",
    });
    await expect(dialog).toBeVisible();
    const preview = page.frameLocator(
      'iframe[title="Pré-visualização fictícia do e-mail de 10 dias"]',
    );
    await expect(preview.getByText("Olá,", { exact: false })).toBeVisible();
    await expect(
      preview.getByRole("link", { name: "Acessar meu convite" }),
    ).toHaveAttribute("href", /PREVIA-FICTICIA-SEM-ACESSO/);
    await expect(
      preview.locator("strong").filter({ hasText: "FALTAM APENAS 10 DIAS!" }),
    ).toBeVisible();
    await expect(preview.locator("img")).toHaveAttribute(
      "src",
      /Template-Faltam%2010%20dias-horizontal.png/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await preview
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await preview
      .locator("body")
      .screenshot({
        path: `/tmp/reminder-email-${width}.png`,
        animations: "disabled",
      });
    await page.screenshot({
      path: `/tmp/reminder-preview-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", { name: "Verificar imagem do lembrete" })
      .click();
    await expect(
      page.getByText("Arte: upload pendente ou imagem indisponível", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Mensagem do e-mail de 10 dias", { exact: true })
      .fill("Mensagem sem personalização");
    await expect(
      page.getByRole("button", { name: "Salvar lembrete de 10 dias" }),
    ).toBeDisabled();
  });
test("configuration persists without touching general channel flags or invitations", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Notificações", exact: true }).click();
  const field = page.getByLabel("Assunto do e-mail de 10 dias", {
    exact: true,
  });
  await expect(field).not.toHaveValue("");
  await field.fill("Assunto de teste controlado");
  await page
    .getByRole("button", { name: "Salvar lembrete de 10 dias" })
    .click();
  await page.reload();
  await expect(field).toHaveValue("Assunto de teste controlado");
  expect(db.sql("select notification_email_enabled from events").trim()).toBe(
    "f",
  );
  expect(
    db
      .sql(
        "select count(*) from notification_jobs where ten_day_campaign_id is not null",
      )
      .trim(),
  ).toBe("0");
});
