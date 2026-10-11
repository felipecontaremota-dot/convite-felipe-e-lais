import { test, expect } from "@playwright/test";
import { FIRST_LIST } from "../../src/features/gifts/giftLists";

test("external gift lists: add, edit, delete, reload and accessible mobile guest links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  await expect(page.getByLabel("Título do presente")).toHaveCount(0);
  await expect(page.getByText("Um novo capítulo", { exact: true })).toHaveCount(
    0,
  );
  const add = page.getByRole("button", {
    name: "Adicionar lista",
    exact: true,
  });
  const save = page.getByRole("button", { name: "Salvar lista", exact: true });
  await add.click();
  await expect(page.getByLabel("Título da lista")).toHaveValue(
    FIRST_LIST.title,
  );
  await expect(page.getByLabel("Link da lista")).toHaveValue(FIRST_LIST.url);
  await page.getByLabel("Link da lista").fill("havan");
  await save.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Informe um título e um link HTTPS válido.",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.gifts.filter(
          (g: { description: string }) =>
            g.description === "external-gift-list:v1",
        ).length,
    ),
  ).toBe(0);
  await page.getByLabel("Link da lista").fill(FIRST_LIST.url);
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await add.click();
  await expect(page.getByLabel("Título da lista")).toHaveValue("");
  await page
    .getByLabel("Título da lista")
    .fill("Lista de Presentes - Outra Loja");
  await page
    .getByLabel("Link da lista")
    .fill("https://example.test/lista-original");
  await save.click();
  await page
    .getByRole("button", {
      name: "Editar lista Lista de Presentes - Outra Loja",
      exact: true,
    })
    .click();
  await page.getByLabel("Título da lista").fill("Lista alternativa");
  await page
    .getByLabel("Link da lista")
    .fill("https://example.test/lista-atualizada");
  await save.click();
  await page.reload();
  await expect(page.getByText(FIRST_LIST.title, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Lista alternativa", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Excluir lista Lista alternativa",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("Lista alternativa", { exact: true }),
  ).toBeVisible();
  await add.click();
  await page.getByLabel("Título da lista").fill("Lista descartável");
  await page
    .getByLabel("Link da lista")
    .fill("https://example.test/descartavel");
  await save.click();
  await page
    .getByRole("button", {
      name: "Excluir lista Lista descartável",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByText("Lista descartável", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Lista descartável", { exact: true }),
  ).toHaveCount(0);
  // The old product remains stored, despite no longer appearing in either UI.
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("demo-db")!).snapshot.gifts.some(
        (g: { title: string }) => g.title === "Um novo capítulo",
      ),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  const havan = page.getByRole("link", { name: FIRST_LIST.title, exact: true });
  await expect(havan).toHaveAttribute("href", FIRST_LIST.url);
  await expect(havan).toHaveAttribute("target", "_blank");
  await expect(havan).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("link", { name: "Lista alternativa", exact: true }),
  ).toHaveAttribute("href", "https://example.test/lista-atualizada");
  await expect(
    page.getByRole("checkbox", { name: /Tenho interesse/ }),
  ).toHaveCount(0);
  await havan.focus();
  // Intercept locally: never contact the store during validation.
  await page
    .context()
    .route("https://lista.havan.com.br/**", (route) =>
      route.fulfill({ body: "fixture loja externa", contentType: "text/html" }),
    );
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe(FIRST_LIST.url);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(havan).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
