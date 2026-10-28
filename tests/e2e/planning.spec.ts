import { test, expect } from "@playwright/test";
for (const width of [390, 1280])
  test(`supplier PIX autofill and manual overrides in creation and editing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Planejamento do Casamento", exact: true })
      .click();
    await page
      .getByRole("radio", { name: "Fornecedores", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cadastrar fornecedor", exact: true })
      .click();
    let modal = page.getByRole("dialog", { name: "Fornecedor", exact: true });
    const field = (name: string) => modal.getByLabel(name, { exact: true });
    await field("Nome do fornecedor ou empresa").fill("Fornecedor PIX");
    await field("CPF ou CNPJ").fill("52998224725");
    await field("Tipo de chave PIX").selectOption("CPF");
    await expect(field("Chave PIX")).toHaveValue("52998224725");
    await field("CPF ou CNPJ").fill("123");
    await expect(field("Chave PIX")).toHaveValue("52998224725");
    await field("Tipo de chave PIX").selectOption("CNPJ");
    await field("CPF ou CNPJ").fill("11222333000181");
    await expect(field("Chave PIX")).toHaveValue("11222333000181");
    await field("Telefone").fill("(62) 99999-9999");
    await field("Tipo de chave PIX").selectOption("PHONE");
    await expect(field("Chave PIX")).toHaveValue("+5562999999999");
    await field("Tipo de chave PIX").selectOption("EMAIL");
    await expect(field("Chave PIX")).toHaveValue("+5562999999999");
    await field("E-mail").fill("supplier@example.test");
    await expect(field("Chave PIX")).toHaveValue("supplier@example.test");
    await field("Chave PIX").fill("third-party@example.test");
    await field("E-mail").fill("changed@example.test");
    await expect(field("Chave PIX")).toHaveValue("third-party@example.test");
    await field("Tipo de chave PIX").selectOption("CPF");
    await expect(field("Chave PIX")).toHaveValue("third-party@example.test");
    await field("CPF ou CNPJ").fill("52998224725");
    await expect(field("Chave PIX")).toHaveValue("52998224725");
    await field("Tipo de chave PIX").selectOption("EMAIL");
    await expect(field("Chave PIX")).toHaveValue("changed@example.test");
    await field("Chave PIX").fill("third-party@example.test");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page
      .getByRole("button", { name: "Detalhes de Fornecedor PIX", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar fornecedor", exact: true })
      .click();
    modal = page.getByRole("dialog", { name: "Fornecedor", exact: true });
    await expect(field("Chave PIX")).toHaveValue("third-party@example.test");
    await field("E-mail").fill("edited@example.test");
    await expect(field("Chave PIX")).toHaveValue("third-party@example.test");
    await field("Tipo de chave PIX").selectOption("PHONE");
    await expect(field("Chave PIX")).toHaveValue("+5562999999999");
    await field("Telefone").fill("62988887777");
    await expect(field("Chave PIX")).toHaveValue("+5562988887777");
    await field("Tipo de chave PIX").selectOption("EMAIL");
    await expect(field("Chave PIX")).toHaveValue("edited@example.test");
    await field("Chave PIX").fill("manual@example.test");
    await modal.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(modal).toHaveCount(0);
  });
for (const promoted of [false, true])
  test(`guest ${promoted ? "with wedding-party promotion" : "without promotion"} has no planning access`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    if (promoted) {
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        db.weddingParty = [
          {
            guest_id: db.snapshot.guests[0].id,
            active: true,
            role: "PADRINHO",
          },
        ];
        localStorage.setItem("demo-db", JSON.stringify(db));
      });
      await page.reload();
    }
    await expect(
      page.getByRole("link", {
        name: "Planejamento do Casamento",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goto("/planejamento");
    await expect(
      page.getByText("Total contratado/comprometido", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cadastrar fornecedor", exact: true }),
    ).toHaveCount(0);
  });
