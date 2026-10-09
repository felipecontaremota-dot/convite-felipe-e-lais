import { test, expect, type Page } from "@playwright/test";
async function admin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
test("guest modals trap focus, close with Escape, never expand list; notes badge trims whitespace", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  for (const [name, notes] of [
    ["Sem nota", ""],
    ["Espaços", "   "],
    ["Com nota", "Conteúdo privado"],
  ]) {
    await page
      .getByRole("button", { name: "Adicionar convidado", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Adicionar convidado",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Famílias", exact: true }),
    ).toHaveCount(0);
    await dialog.getByLabel("Nome", { exact: true }).fill(name!);
    await dialog.getByLabel("Observações", { exact: true }).fill(notes!);
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const row = page
      .getByRole("button", { name: `Abrir ficha de ${name}`, exact: true })
      .locator("..");
    const badge = row.getByLabel("Possui observação administrativa", {
      exact: true,
    });
    if (notes?.trim()) {
      await expect(badge).toHaveText("!");
      expect(
        await badge.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(162, 34, 44)");
      await expect(row.getByText(notes, { exact: true })).toHaveCount(0);
    } else await expect(badge).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Abrir ficha de Com nota", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "Com nota", exact: true });
  await expect(
    detail.getByText("Observações: Conteúdo privado", { exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Editar convidado", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Editar convidado",
    exact: true,
  });
  await expect(edit.getByLabel("Nome", { exact: true })).toHaveValue(
    "Com nota",
  );
  await edit.getByRole("button", { name: "Cancelar", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    edit.getByRole("button", { name: "Fechar modal", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    edit.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar convidado", exact: true }),
  ).toBeVisible();
});
test("direct trash opens only confirmation and cancel never enters selection mode", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Excluir convidado Convidado Um",
      exact: true,
    })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Confirmação",
    exact: true,
  });
  await expect(modal).toContainText(
    "Tem certeza que deseja excluir este convidado(a)? A ação não poderá ser desfeita e ele será removido da família que fizer parte.",
  );
  await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0);
  await expect(
    modal.getByRole("button", { name: "Confirmar", exact: true }),
  ).toHaveCount(0);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: "Selecionar Convidado Um",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "false");
});
