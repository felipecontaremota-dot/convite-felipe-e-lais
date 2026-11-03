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
test.beforeEach(() =>
  db.sql(
    "delete from planning_settlements;delete from planning_dues;delete from planning_vendors;delete from planning_budgets;",
  ),
);
async function backend(
  page: Page,
  uid: string,
  control = { losePayment: false },
) {
  const exp = Math.floor(Date.now() / 1000) + 3600,
    enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "planning@example.test",
    is_anonymous: false,
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let data: unknown = {},
      status = 200;
    try {
      if (path.startsWith("/auth/"))
        data = path.endsWith("/user") ? user : session;
      else if (path.startsWith("/rest/v1/rpc/")) {
        const args = req.postDataJSON() || {};
        data = db.rpc(uid, path.split("/").at(-1)!, args);
        if (args.p_kind === "PAYMENT_SAVE" && control.losePayment) {
          control.losePayment = false;
          throw Error("Simulated lost committed response");
        }
      } else throw Error("unsupported");
    } catch (e) {
      status = 400;
      data = {
        message:
          String(e).match(/simple_[a-z_]+/)?.[0] ||
          "Operação não autorizada ou inválida.",
        code: "P0001",
      };
    }
    await route.fulfill({ status, json: data });
  });
}
async function login(page: Page, uid: string) {
  const control = { losePayment: false };
  await backend(page, uid, control);
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("planning@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(uid === f.admin ? /\/painel$/ : /\/inicio$/);
  return control;
}
const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true });
for (const width of [390, 1280])
  test(`simple supplier ledger, exact 1820, partial payments, sorting and reload at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const control = await login(page, f.admin);
    await page
      .getByRole("link", { name: "Planejamento do Casamento", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "Despesas e contratos", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("radio", { name: "Documentos", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Definir orçamento", exact: true })
      .click();
    let modal = dialog(page, "Orçamento previsto");
    await modal
      .getByLabel("Orçamento previsto", { exact: true })
      .fill("30.000,00");
    await modal
      .getByRole("button", { name: "Salvar orçamento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("radio", { name: "Fornecedores", exact: true })
      .click();
    const create = async (name: string, type: string, total: string) => {
      await page
        .getByRole("button", { name: "Cadastrar fornecedor", exact: true })
        .click();
      const m = dialog(page, "Cadastrar fornecedor");
      await m.getByLabel("Nome/Nome empresarial", { exact: true }).fill(name);
      await m
        .getByLabel("Valor total do contrato", { exact: true })
        .fill(total);
      if (type !== "CASH")
        await m
          .getByRole("radio", {
            name: type === "DOWN" ? "Entrada + parcelas" : "Somente parcelas",
            exact: true,
          })
          .click();
      return m;
    };
    const name = `Villarejo ${width}`;
    modal = await create(name, "DOWN", "18.200,00");
    await modal
      .getByLabel("Valor da entrada", { exact: true })
      .fill("1.820,00");
    await modal
      .getByLabel("Data da entrada (DD/MM/AAAA)", { exact: true })
      .fill("08/10/2026");
    await modal.getByLabel("Quantidade de parcelas", { exact: true }).fill("2");
    await expect(modal.getByLabel("Valor 2", { exact: true })).toHaveValue(
      "8.190,00",
    );
    await expect(modal.getByLabel("Valor 3", { exact: true })).toHaveValue(
      "8.190,00",
    );
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", { name: `Abrir fornecedor ${name}`, exact: true })
      .click();
    let detail = dialog(page, name);
    await detail
      .getByRole("button", {
        name: "Registrar pagamento de Entrada",
        exact: true,
      })
      .click();
    modal = dialog(page, "Registrar pagamento");
    await expect(modal.getByLabel("Valor pago", { exact: true })).toHaveValue(
      "1.820,00",
    );
    await modal
      .getByLabel("Data efetiva do pagamento (DD/MM/AAAA)", { exact: true })
      .fill("08/10/2026");
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await expect(
      detail.getByText("Saldo pendente: R$ 16.380,00", { exact: true }),
    ).toBeVisible();
    await detail
      .getByRole("button", {
        name: "Registrar pagamento de Parcela 1",
        exact: true,
      })
      .click();
    modal = dialog(page, "Registrar pagamento");
    await modal.getByLabel("Valor pago", { exact: true }).fill("8.190,01");
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal.getByRole("alert")).toContainText("superior");
    await modal.getByLabel("Valor pago", { exact: true }).fill("500,00");
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await detail
      .getByRole("button", {
        name: "Registrar pagamento de Parcela 1",
        exact: true,
      })
      .click();
    modal = dialog(page, "Registrar pagamento");
    await expect(modal.getByLabel("Valor pago", { exact: true })).toHaveValue(
      "7.690,00",
    );
    control.losePayment = true;
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal.getByRole("alert")).toBeVisible();
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    modal = await create(`À vista ${width}`, "CASH", "2.655,00");
    await modal
      .getByLabel("Primeiro vencimento (DD/MM/AAAA)", { exact: true })
      .fill("10/10/2026");
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", {
        name: `Abrir fornecedor À vista ${width}`,
        exact: true,
      })
      .click();
    detail = dialog(page, `À vista ${width}`);
    await detail
      .getByRole("button", {
        name: "Registrar pagamento de À vista",
        exact: true,
      })
      .click();
    modal = dialog(page, "Registrar pagamento");
    await modal
      .getByRole("button", { name: "Salvar pagamento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    modal = await create(`Parcelado ${width}`, "INSTALLMENTS", "2.000,00");
    await modal
      .getByLabel("Primeiro vencimento (DD/MM/AAAA)", { exact: true })
      .fill("10/10/2026");
    await modal.getByLabel("Quantidade de parcelas", { exact: true }).fill("4");
    await expect(modal.getByLabel("Valor 4", { exact: true })).toHaveValue(
      "500,00",
    );
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", {
        name: `Abrir fornecedor Parcelado ${width}`,
        exact: true,
      })
      .click();
    detail = dialog(page, `Parcelado ${width}`);
    await detail
      .getByRole("button", { name: "Editar fornecedor e plano", exact: true })
      .click();
    modal = dialog(page, "Editar fornecedor");
    await modal.getByLabel("Descrição 1", { exact: true }).fill("Primeira");
    await modal.getByLabel("Descrição 2", { exact: true }).fill("Segunda");
    await modal
      .getByRole("button", {
        name: "Mover vencimento 2 para cima",
        exact: true,
      })
      .click();
    await expect(modal.getByLabel("Descrição 1", { exact: true })).toHaveValue(
      "Segunda",
    );
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Editar fornecedor e plano", exact: true })
      .click();
    modal = dialog(page, "Editar fornecedor");
    await expect(modal.getByLabel("Descrição 1", { exact: true })).toHaveValue(
      "Segunda",
    );
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
    await detail
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    await page.reload();
    await page.getByRole("radio", { name: "Pagamentos", exact: true }).click();
    await expect(page.locator("[data-payment-row]")).toHaveCount(4);
    await page.getByRole("button", { name: "Valor pago", exact: true }).click();
    await page
      .getByRole("button", { name: "Valor pago ↑", exact: true })
      .click();
    await expect(page.locator("[data-payment-row]").first()).toContainText(
      "7.690,00",
    );
    await page.getByRole("button", { name: "Fornecedor", exact: true }).click();
    await expect(page.locator("[data-payment-row]").first()).toContainText(
      `À vista ${width}`,
    );
    await page
      .getByRole("button", { name: "Fornecedor ↑", exact: true })
      .click();
    await expect(page.locator("[data-payment-row]").first()).toContainText(
      name,
    );
    for (const title of ["Data de vencimento", "Data de pagamento"]) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await page
        .getByRole("button", { name: `${title} ↑`, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: `${title} ↓`, exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("radio", { name: "Visão geral", exact: true }).click();
    await expect(
      page.getByRole("progressbar", { name: "Percentual pago", exact: true }),
    ).toHaveAttribute("aria-valuenow", String((1266500 / 2285500) * 100));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/simple-planning-overview-${width}.png`,
      fullPage: true,
    });
    for (const viewport of [320, 768, width]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("progressbar", { name: "Percentual pago", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/simple-planning-progress-${viewport}.png`,
      });
    }
    if (width === 390) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator("[data-financial-progress]")).toHaveCSS(
        "transition-duration",
        "0s",
      );
    }

    await page
      .getByRole("radio", { name: "Fornecedores", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Abrir fornecedor ${name}`, exact: true })
      .click();
    detail = dialog(page, name);
    await detail
      .getByRole("button", { name: "Editar fornecedor e plano", exact: true })
      .click();
    modal = dialog(page, "Editar fornecedor");
    await modal
      .getByLabel("Vencimento 2 (DD/MM/AAAA)", { exact: true })
      .fill("09/11/2026");
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal.getByRole("alert")).toContainText("Confirme");
    await modal
      .getByRole("checkbox", {
        name: "Confirmo o ajuste do plano que possui pagamentos registrados",
        exact: true,
      })
      .click();
    await modal
      .getByRole("button", { name: "Salvar fornecedor", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Excluir fornecedor", exact: true })
      .click();
    const confirm = dialog(page, "Excluir fornecedor");
    await expect(confirm).toContainText("10.010,00");
    await confirm
      .getByRole("button", { name: "Excluir fornecedor", exact: true })
      .click();
    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Abrir fornecedor ${name}`,
        exact: true,
      }),
    ).toHaveCount(0);
  });
test("ceremonialist cannot see or query the simple financial module", async ({
  page,
}) => {
  await login(page, f.staff);
  await page.goto("/planejamento");
  await expect(
    page.getByRole("button", { name: "Cadastrar fornecedor", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Planejamento do Casamento", exact: true }),
  ).toHaveCount(0);
});
