import { test, expect, type Page } from "@playwright/test";
async function admin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
test("failed queue reports manual failure; discard requires confirmation and preserves following action", async ({
  page,
}) => {
  await admin(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
    const item = (mutationId: string, payload: object) => ({
      mutationId,
      type: "MESSAGE_SEND_TO_GUESTS",
      payload,
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(
      `queue:${db.event.id}:demo-ADMIN`,
      JSON.stringify([
        item("invalid-old", { content: "Invalid", recipient_guest_ids: [] }),
        item("valid-following", {
          content: "Following message",
          recipient_guest_ids: [db.guests[0].id],
          channels: ["IN_APP"],
        }),
      ]),
    );
  });
  await page.reload();
  await expect(
    page.getByText("2 alterações aguardando sincronização", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Falha ao enviar mensagem.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tentativas: 1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Sincronizar agora", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("2 restantes");
  await expect(page.getByText("Tentativas: 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Descartar alteração com erro", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirmação", exact: true });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("2 alterações aguardando sincronização", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Descartar alteração com erro", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirmação", exact: true })
    .getByRole("button", { name: "Descartar", exact: true })
    .click();
  await expect(
    page.getByText("1 alteração aguardando sincronização", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sincronizar agora", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sincronizar agora", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("1 alteração sincronizada. Nenhuma alteração pendente.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.filter(
          (m: { content: string }) => m.content === "Following message",
        ).length,
    ),
  ).toBe(1);
});
test("family accordion only toggles on header, starts closed after reopen; invitation buttons remain available", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Famílias", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar família Família Demo", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
      name: "Editar família — Família Demo",
      exact: true,
    }),
    header = dialog.getByRole("button", { name: "Membros (3)", exact: true });
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(
    dialog.getByRole("button", {
      name: "Editar convidado Convidado Um",
      exact: true,
    }),
  ).toHaveCount(0);
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("button", {
      name: "Editar convidado Convidado Um",
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByText("Nome da família", { exact: true }).click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await dialog
    .getByRole("button", { name: "Fechar edição", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar família Família Demo", exact: true })
    .click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Enviar convite para Convidado Um",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Enviar convite para Convidado Um",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Este convidado não possui e-mail cadastrado.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enviar todos os convites", exact: true })
    .click();
  const bulk = page.getByRole("dialog", {
    name: "Enviar todos os convites",
    exact: true,
  });
  await expect(bulk).toContainText("convidados ativos");
  await expect(bulk).toContainText("convites serão enviados");
  await bulk.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(bulk).toHaveCount(0);
});
