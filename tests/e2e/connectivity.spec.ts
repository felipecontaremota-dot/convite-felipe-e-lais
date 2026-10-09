import { test, expect } from "@playwright/test";

test("Web reconhece offline e reconexão sem evento NetworkInformation.change", async ({
  page,
  context,
}) => {
  // NetworkInformation does not guarantee a change event when navigator.onLine changes.
  // Keep that API present but silent; Playwright still disconnects the real browser.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: new EventTarget(),
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo cerimonial", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sair deste dispositivo" }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.getByText(/Sem conexão/)).toHaveCount(0);
});
