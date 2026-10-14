import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
}
async function offer(
  page: Page,
  outcome: "accepted" | "dismissed" = "dismissed",
  fail = false,
) {
  return page.evaluate(
    ({ outcome, fail }) => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          document.body.dataset.promptCalls = String(
            Number(document.body.dataset.promptCalls || 0) + 1,
          );
          if (fail) throw new Error("Prompt no longer valid");
        },
        userChoice: Promise.resolve({ outcome }),
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { outcome, fail },
  );
}
test("item após Perfil, fallback acessível e layout de 320 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await enter(page);
  const nav = page
    .getByRole("link", { name: "Perfil", exact: true })
    .locator("..");
  expect(await nav.locator(":scope > *").allTextContents()).toEqual([
    "Início",
    "Presença",
    "Convites",
    "Presentes",
    "Local",
    "Informações",
    "Perfil",
    "Baixar app",
  ]);
  const button = page.getByRole("button", { name: "Baixar app", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", {
    name: "Instale este convite como app",
  });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/abra o menu do navegador/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
});

test("captura antes do login, prompt aceito, evento consumido e appinstalled", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Demo convidado", exact: true }),
  ).toBeVisible();
  expect(await offer(page, "accepted")).toBe(true);
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("link", { name: "Presença", exact: true }).click();
  await page.getByRole("button", { name: "Baixar app", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Instalação solicitada" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.promptCalls)).toBe(
    "1",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("button", { name: "Baixar app", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("recusa não reutiliza prompt e um novo evento permite tentar novamente", async ({
  page,
}) => {
  await enter(page);
  expect(await offer(page)).toBe(true);
  const button = page.getByRole("button", { name: "Baixar app", exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "false");
  await button.click();
  await expect(
    page.getByRole("dialog", { name: "Instale este convite como app" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.promptCalls)).toBe(
    "1",
  );
  await page.keyboard.press("Escape");
  await offer(page);
  await button.click();
  expect(await page.evaluate(() => document.body.dataset.promptCalls)).toBe(
    "2",
  );
});

test("prompt inválido oferece instruções sem erro não tratado", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await offer(page, "dismissed", true);
  await page.getByRole("button", { name: "Baixar app", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Instale este convite como app" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const ipad of [false, true]) {
  test(`instruções ${ipad ? "iPadOS desktop" : "iPhone"}`, async ({ page }) => {
    await page.addInitScript(
      ({ ipad }) => {
        Object.defineProperty(navigator, "userAgent", {
          value: ipad ? "Macintosh Safari" : "iPhone Safari",
        });
        Object.defineProperty(navigator, "platform", {
          value: ipad ? "MacIntel" : "iPhone",
        });
        Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
      },
      { ipad },
    );
    await enter(page);
    await page.getByRole("button", { name: "Baixar app", exact: true }).click();
    const modal = page.getByRole("dialog", {
      name: "Instale este convite como app",
    });
    await expect(modal.getByText(/Compartilhar/)).toBeVisible();
    await expect(modal.getByText(/Adicionar à Tela de Início/)).toBeVisible();
  });
}
for (const apple of [false, true]) {
  test(`instalado via ${apple ? "navigator.standalone" : "display-mode"} não oferece botão`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ apple }) => {
        if (apple)
          Object.defineProperty(navigator, "standalone", { value: true });
        else {
          const original = window.matchMedia.bind(window);
          window.matchMedia = (query) => {
            const media = original(query);
            if (query === "(display-mode: standalone)")
              Object.defineProperty(media, "matches", { value: true });
            return media;
          };
        }
      },
      { apple },
    );
    await enter(page);
    await expect(
      page.getByRole("button", { name: "Baixar app", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Perfil", exact: true }),
    ).toBeVisible();
  });
}
