import { test, expect, type Page } from "@playwright/test";
const label = "Deixe uma mensagem para o casal";
async function enter(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await expect(page.getByRole("button", { name: label })).toBeVisible();
}

test("apresentação completa, posição fixa e persistência entre seções", async ({
  page,
}) => {
  await enter(page);
  const button = page.getByRole("button", { name: label });
  await expect(
    page.getByRole("link", { name: "Mensagens", exact: true }),
  ).toHaveCount(0);
  await expect(button).toHaveAttribute("data-phase", "idle");
  const initial = (await button.boundingBox())!;
  expect(initial.width).toBe(56);
  await expect(button).toHaveAttribute("data-phase", "opening", {
    timeout: 7000,
  });
  await expect(button).toHaveAttribute("data-phase", "reading");
  const expanded = (await button.boundingBox())!;
  expect(expanded.width).toBeCloseTo(336, 0);
  expect(expanded.x + expanded.width).toBeCloseTo(initial.x + initial.width, 0);
  await page.getByRole("link", { name: "Presença", exact: true }).click();
  await expect(button).toHaveAttribute("data-phase", "reading");
  await expect(button).toHaveAttribute("data-phase", "closing", {
    timeout: 6000,
  });
  await expect(button).toHaveAttribute("data-phase", "done");
  expect((await button.boundingBox())!.width).toBe(56);
  await page.reload();
  await expect(button).toHaveAttribute("data-phase", "done");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/mensagens$/);
  await page
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Recado pelo botão flutuante");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    page.getByText("Recado pelo botão flutuante", { exact: true }),
  ).toBeVisible();
});

for (const phase of ["idle", "opening", "closing"]) {
  test(`clique durante ${phase} abre a tela original`, async ({ page }) => {
    await enter(page);
    const button = page.getByRole("button", { name: label });
    await expect(button).toHaveAttribute("data-phase", phase, {
      timeout: 14000,
    });
    await button.click();
    await expect(page).toHaveURL(/\/mensagens$/);
    await expect(
      page.getByLabel("Mensagem aos noivos", { exact: true }),
    ).toBeVisible();
  });
}

test("mobile estreito e movimento reduzido", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await enter(page);
  const button = page.getByRole("button", { name: label });
  await expect(button).toHaveAttribute("data-phase", "reading", {
    timeout: 8000,
  });
  const rect = (await button.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const text = await button.locator(".wedding-messages-label").boundingBox();
  expect(text!.x).toBeGreaterThan(rect.x);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(button).toHaveAttribute("data-phase", "done");
  await button.click();
  await expect(page).toHaveURL(/\/mensagens$/);
});

test("admin mantém menu e não recebe botão dos convidados", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo noivos", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Mensagens", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: label })).toHaveCount(0);
});
