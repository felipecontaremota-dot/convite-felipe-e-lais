import { expect, type Page } from "@playwright/test";
export async function closeRsvpPresentation(page: Page) {
  const response = page.getByRole("dialog", {
    name: "Sua resposta",
    exact: true,
  });
  await expect(response).toBeVisible();
  await response
    .getByRole("button", { name: "Fechar modal", exact: true })
    .click();
  const compose = page.getByRole("dialog", {
    name: "Deixe uma mensagem para os noivos 💌",
    exact: true,
  });
  await expect(compose).toBeVisible();
  await compose.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(compose).toHaveCount(0);
}
