import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { TestPostgres } from "../support/postgres";
import { ticketFixture } from "../support/ticket-fixture";
const db = new TestPostgres();
let f: ReturnType<typeof ticketFixture>;
const files = new Map<string, Buffer>();
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  f = ticketFixture(db);
});
test.afterAll(() => db.stop());
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
    is_anonymous: uid !== f.admin && uid !== f.staff,
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
          throw Error("Simulated committed reply lost");
        }
      } else if (path === "/functions/v1/planning-documents") {
        db.rpc(uid, "planning_snapshot", { p_event: f.event });
        const form = await new Response(req.postDataBuffer(), {
          headers: { "Content-Type": req.headers()["content-type"]! },
        }).formData();
        const file = form.get("file") as File,
          identifier = String(form.get("id")),
          bytes = Buffer.from(await file.arrayBuffer()),
          sha = createHash("sha256").update(bytes).digest("hex");
        const reservation = db.rpc(uid, "planning_action", {
          p_event: f.event,
          p_kind: "DOCUMENT_PREPARE",
          p_id: identifier,
          p_version: null,
          p_request: String(form.get("request_id")),
          p_values: {
            entry_id: String(form.get("entry_id")),
            name: file.name,
            mime: file.type,
            size_bytes: bytes.length,
            sha256: sha,
          },
        });
        db.sql(
          `insert into storage.objects(bucket_id,name) values('wedding-planning','${reservation.path}') on conflict do nothing;begin;set local role service_role;select planning_document_finish('${f.event}','${identifier}','${sha}');commit;`,
        );
        files.set(reservation.path, bytes);
        data = { id: identifier };
      } else if (path.startsWith("/storage/v1/object/")) {
        const name = path.split("/wedding-planning/")[1]!;
        const count = db
          .sql(
            `begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';select count(*) from storage.objects where bucket_id='wedding-planning' and name='${name}';commit;`,
          )
          .trim();
        if (count !== "1" || !files.has(name)) throw Error("unauthorized");
        await route.fulfill({
          status: 200,
          contentType: "application/pdf",
          body: files.get(name),
        });
        return;
      } else throw Error("Unsupported fixture path");
    } catch (e) {
      status = 400;
      data = {
        message: String(e).includes("planning_overpay")
          ? "planning_overpay"
          : "Operação não autorizada ou inválida.",
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
  test(`real authorized ledger, partial payments, private document lifecycle and responsive layout at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const control = await login(page, f.admin);
    await page
      .getByRole("link", { name: "Planejamento do Casamento", exact: true })
      .click();
    await expect(
      page.getByText(
        "Acompanhe fornecedores, contratos, despesas e pagamentos do nosso grande dia.",
      ),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`planning-overview-${width}.png`),
    });
    await page
      .getByRole("button", { name: "Definir orçamento", exact: true })
      .click();
    let modal = dialog(page, "Orçamento global");
    await modal
      .getByLabel("Orçamento global", { exact: true })
      .fill("40.000,00");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("radio", { name: "Fornecedores", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cadastrar fornecedor", exact: true })
      .click();
    modal = dialog(page, "Fornecedor");
    await modal
      .getByLabel("Nome do fornecedor ou empresa", { exact: true })
      .fill(`Fornecedor ${width}`);
    await modal
      .getByLabel("Categoria principal", { exact: true })
      .fill("Fotografia");
    await modal
      .getByLabel("Tipo de chave PIX", { exact: true })
      .selectOption("EMAIL");
    await modal
      .getByLabel("Chave PIX", { exact: true })
      .fill(`financeiro${width}@example.test`);
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    const supplier = JSON.parse(
      db
        .sql(
          `select to_jsonb(s) from planning_suppliers s where name='Fornecedor ${width}'`,
        )
        .trim(),
    );
    await page
      .getByRole("radio", { name: "Despesas e contratos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nova despesa ou contratação", exact: true })
      .click();
    modal = dialog(page, "Despesa ou contratação");
    const title = `Fotografia ${width}`;
    await modal.getByLabel("Título", { exact: true }).fill(title);
    await modal.getByLabel("Categoria", { exact: true }).fill("Fotografia");
    await modal
      .getByLabel("Fornecedor (opcional)", { exact: true })
      .selectOption(supplier.id);
    await modal
      .getByLabel("Situação da contratação", { exact: true })
      .selectOption("CONTRACTED");
    await modal
      .getByRole("radio", { name: "Informações financeiras", exact: true })
      .click();
    await modal
      .getByLabel("Valor inicialmente orçado", { exact: true })
      .fill("2.200,00");
    await modal
      .getByLabel("Valor contratado ou comprometido", { exact: true })
      .fill("2.000,00");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", { name: `Abrir ${title}`, exact: true })
      .click();
    const detail = dialog(page, title);
    await detail
      .getByRole("radio", { name: "Pagamentos", exact: true })
      .click();
    await detail
      .getByRole("button", { name: "Cadastrar parcela", exact: true })
      .click();
    modal = dialog(page, "Parcela");
    await modal
      .getByLabel("Descrição da parcela", { exact: true })
      .fill("Entrada e complementos");
    await modal
      .getByLabel("Valor previsto da parcela", { exact: true })
      .fill("2.000,00");
    await modal
      .getByLabel("Data de vencimento (DD/MM/AAAA)", { exact: true })
      .fill("20/10/2026");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    const entry = JSON.parse(
        db
          .sql(
            `select to_jsonb(e) from planning_entries e where title='${title}'`,
          )
          .trim(),
      ),
      parcel = JSON.parse(
        db
          .sql(
            `select to_jsonb(i) from planning_installments i where entry_id='${entry.id}'`,
          )
          .trim(),
      );
    for (const amount of ["500,00", "700,00", "800,00"]) {
      await detail
        .getByRole("button", { name: "Registrar pagamento", exact: true })
        .click();
      modal = dialog(page, "Registro de pagamento");
      await modal
        .getByLabel("Parcela", { exact: true })
        .selectOption(parcel.id);
      await modal
        .getByLabel("Valor efetivamente pago", { exact: true })
        .fill(amount);
      await modal
        .getByLabel("Data efetiva do pagamento (DD/MM/AAAA)", { exact: true })
        .fill("20/10/2026");
      await modal.getByLabel("Forma de pagamento", { exact: true }).fill("PIX");
      if (amount === "500,00") control.losePayment = true;
      await modal.getByRole("button", { name: "Salvar", exact: true }).click();
      if (amount === "500,00") {
        await expect(modal.getByRole("alert")).toBeVisible();
        await modal
          .getByRole("button", { name: "Salvar", exact: true })
          .click();
      }
      await expect(modal).toHaveCount(0);
      if (amount === "500,00" && width === 390) {
        await detail
          .getByRole("radio", { name: "Dados gerais", exact: true })
          .click();
        await detail
          .getByRole("button", { name: "Arquivar lançamento", exact: true })
          .click();
        const confirmation = dialog(page, "Arquivar registro?");
        await confirmation
          .getByRole("button", { name: "Arquivar", exact: true })
          .click();
        await expect(confirmation).toHaveCount(0);
        await detail
          .getByRole("radio", { name: "Pagamentos", exact: true })
          .click();
        await expect(
          detail.getByText(
            "Lançamento arquivado: a quitação e a conciliação continuam disponíveis, sem desarquivar o registro.",
            { exact: true },
          ),
        ).toBeVisible();
      }
    }
    expect(
      db
        .sql(
          `select sum(amount_cents) from planning_payments where entry_id='${entry.id}'`,
        )
        .trim(),
    ).toBe("200000");
    await detail
      .getByRole("button", { name: "Registrar pagamento", exact: true })
      .click();
    modal = dialog(page, "Registro de pagamento");
    await modal.getByLabel("Parcela", { exact: true }).selectOption(parcel.id);
    await modal
      .getByLabel("Valor efetivamente pago", { exact: true })
      .fill("1,00");
    await modal.getByLabel("Forma de pagamento", { exact: true }).fill("PIX");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText("supera o saldo");
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
    await detail
      .getByRole("radio", { name: "Documentos", exact: true })
      .click();
    await detail
      .getByRole("button", { name: "Anexar documento", exact: true })
      .click();
    modal = dialog(page, "Anexar documento privado");
    await expect(
      modal.getByLabel("Vincular documento", { exact: true }),
    ).toHaveValue(`entry_id:${entry.id}`);
    const name = `Contrato-${width}.pdf`;
    await modal.getByLabel("Selecionar documento").setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
      ),
    });
    await modal
      .getByRole("button", { name: "Salvar documento", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await expect(detail.getByText(name, { exact: true })).toBeVisible();
    await detail
      .getByRole("button", { name: `Preparar documento: ${name}`, exact: true })
      .click();
    const pending = page.waitForEvent("download");
    await detail
      .getByRole("link", { name: "Baixar documento", exact: true })
      .click();
    expect((await pending).suggestedFilename()).toBe(name);
    await detail
      .getByRole("button", { name: `Excluir documento: ${name}`, exact: true })
      .click();
    modal = dialog(page, "Arquivar registro?");
    await modal.getByRole("button", { name: "Arquivar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(
      detail.getByRole("button", {
        name: `Preparar documento: ${name}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await detail
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    await page
      .getByLabel("Buscar fornecedor, serviço ou despesa", { exact: true })
      .fill("Sem correspondência");
    await expect(
      page.getByText(
        "Nenhum lançamento corresponde aos filtros. Cadastre uma despesa ou ajuste a pesquisa.",
      ),
    ).toBeVisible();
    await page
      .getByLabel("Buscar fornecedor, serviço ou despesa", { exact: true })
      .fill("");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`planning-${width}.png`),
      fullPage: true,
    });
    await page.reload();
    await page
      .getByRole("radio", { name: "Despesas e contratos", exact: true })
      .click();
    if (width === 390)
      await page
        .getByRole("checkbox", {
          name: "Mostrar lançamentos arquivados",
          exact: true,
        })
        .click();
    await expect(
      page.getByRole("button", { name: `Abrir ${title}`, exact: true }),
    ).toBeVisible();
  });
test("ceremonialist cannot see the module menu or direct route and no financial RPC is fetched", async ({
  page,
}) => {
  let reads = 0;
  await login(page, f.staff);
  page.on("request", (r) => {
    if (r.url().includes("planning_snapshot")) reads++;
  });
  await expect(
    page.getByRole("link", { name: "Planejamento do Casamento", exact: true }),
  ).toHaveCount(0);
  await page.goto("/planejamento");
  await expect(
    page.getByText("Total contratado/comprometido", { exact: true }),
  ).toHaveCount(0);
  expect(reads).toBe(0);
});

test("complete historical audit can be paged beyond the initial 100 events", async ({
  page,
}) => {
  test.setTimeout(120000);
  const target = JSON.parse(
    db
      .sql(
        "select to_jsonb(e) from planning_entries e order by created_at limit 1",
      )
      .trim(),
  );
  db.sql(
    `insert into audit_logs(event_id,actor,action,entity,entity_id,metadata,created_at) select '${f.event}','${f.admin}','ENTRY_SAVE','planning_entries','${target.id}',jsonb_build_object('after',jsonb_build_object('amount_cents',100000+n)),'2000-01-01T00:00:00Z'::timestamptz+make_interval(secs=>n) from generate_series(1,101) n;`,
  );
  await login(page, f.admin);
  await page
    .getByRole("link", { name: "Planejamento do Casamento", exact: true })
    .click();
  const old = page.getByText(/Depois: Valor: R\$\s*1\.000,01/);
  await expect(old).toHaveCount(0);
  await page
    .getByRole("button", { name: "Carregar mais histórico", exact: true })
    .click();
  await expect(old).toHaveCount(1);
});
