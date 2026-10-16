import { test, expect, type Page } from "@playwright/test";
import {
  presenceChoices,
  confirmationLabels,
  responseContent,
  responseMessages,
} from "../../src/features/rsvp/presenceContent";

const description =
  "Responda por cada integrante. A confirmação é diferente da entrada no dia do evento.";
const title = "Sua presença faz parte da nossa história";
const snapshot = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("demo-db")!));
async function home(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
}
for (const width of [320, 1280]) {
  test(`Home shortcut opens without writing, closes accessibly and links information at ${width}px`, async ({
    page,
  }) => {
    await home(page, width);
    const before = await snapshot(page);
    const trigger = page.getByRole("button", {
      name: "Confirmar presença",
      exact: true,
    });
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    for (const close of ["x", "escape", "outside"]) {
      await trigger.click();
      await expect(page).toHaveURL(/\/inicio$/);
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.getByText(description, { exact: true })).toHaveCount(
        0,
      );
      await expect(
        dialog.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(
        "hidden",
      );
      for (const choice of presenceChoices)
        await expect(
          dialog.getByRole("radio", { name: choice.label, exact: true }).last(),
        ).toBeVisible();
      await dialog
        .getByRole("textbox", {
          name: "Observação de Convidada Dois",
          exact: true,
        })
        .fill("Rascunho não enviado");
      if (close === "x")
        await dialog
          .getByRole("button", { name: "Fechar modal", exact: true })
          .click();
      else if (close === "escape") await page.keyboard.press("Escape");
      else await page.mouse.click(2, 2);
      await expect(dialog, `closed by ${close}`).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
        "hidden",
      );
      expect(await snapshot(page)).toEqual(before);
    }
    await expect(
      page.getByRole("button", { name: "Informar contatos", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Ver informações", exact: true })
      .click();
    await expect(page).toHaveURL(/\/informacoes$/);
    await expect(
      page.getByRole("heading", { name: "Informações", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Presença", exact: true }).click();
    await expect(
      page.getByText(description, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(
      page.getByRole("textbox", {
        name: "E-mail de Convidado Um",
        exact: true,
      }),
    ).toBeVisible();
  });

  for (const status of ["CONFIRMED", "DECLINED", "PENDING"] as const) {
    test(`Home ${status} reuses persistence, reaction, compose and screen state at ${width}px`, async ({
      page,
    }) => {
      if (status === "PENDING")
        await page.emulateMedia({ reducedMotion: "reduce" });
      await home(page, width);
      const before = await snapshot(page);
      await page
        .getByRole("button", { name: "Confirmar presença", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      const card = dialog
        .getByText("Convidada Dois", { exact: true })
        .locator("..");
      await card
        .getByRole("textbox", {
          name: "Restrição alimentar de Convidada Dois",
          exact: true,
        })
        .fill("Sem lactose");
      await card
        .getByRole("textbox", {
          name: "Observação de Convidada Dois",
          exact: true,
        })
        .fill("Chegaremos cedo");
      await card
        .getByRole("radio", {
          name: presenceChoices.find((c) => c.value === status)!.label,
          exact: true,
        })
        .click();
      await card
        .getByRole("button", { name: confirmationLabels[status], exact: true })
        .evaluate((button: HTMLButtonElement) => {
          button.click();
          button.click();
        });
      if (status !== "PENDING") {
        const fx = page.locator(`[data-rsvp-fx="${status}"]`);
        await expect(fx).toBeVisible();
        expect(await fx.evaluate((el) => getComputedStyle(el).zIndex)).toBe(
          "10000",
        );
        await expect(
          dialog.getByRole("button", { name: "Fechar modal", exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
      }
      const response = page.getByRole("dialog", {
        name: responseContent[status].title,
        exact: true,
      });
      await expect(response).toBeVisible();
      await expect(
        response.getByText(responseContent[status].message, { exact: true }),
      ).toBeVisible();
      // Only the top dialog is exposed; focus stays within the reaction.
      await expect(dialog).toHaveCount(0);
      await expect(
        response.getByRole("button", { name: "Fechar modal", exact: true }),
      ).toBeFocused();
      await response
        .getByRole("button", { name: "Fechar modal", exact: true })
        .click();
      const compose = page.getByRole("dialog", {
        name: "Deixe uma mensagem para os noivos 💌",
        exact: true,
      });
      await expect(compose).toBeVisible();
      if (status === "CONFIRMED") {
        await compose.getByRole("textbox").fill("Estamos felizes por vocês!");
        await compose
          .getByRole("button", { name: "Enviar", exact: true })
          .click();
      } else
        await compose
          .getByRole("button", { name: "Fechar", exact: true })
          .click();
      await expect(compose).toHaveCount(0);
      await expect(
        card.getByText(responseMessages[status], { exact: true }),
      ).toBeVisible();
      const saved = await snapshot(page);
      const guestId = saved.snapshot.guests[1].id;
      expect(
        saved.snapshot.rsvps.filter(
          (r: { guest_id: string }) => r.guest_id === guestId,
        ),
      ).toEqual([
        expect.objectContaining({
          status,
          dietary: "Sem lactose",
          note: "Chegaremos cedo",
          responded_at: expect.any(String),
        }),
      ]);
      const mutations = saved.applied.length - before.applied.length;
      expect(mutations).toBe(status === "CONFIRMED" ? 2 : 1);
      await dialog
        .getByRole("button", { name: "Fechar modal", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("link", { name: "Presença", exact: true }).click();
      const screenCard = page
        .getByText("Convidada Dois", { exact: true })
        .filter({ visible: true })
        .locator("..");
      await expect(
        screenCard.getByText(responseMessages[status], { exact: true }),
      ).toBeVisible();
      await screenCard
        .getByRole("button", { name: "Editar minha confirmação", exact: true })
        .click();
      await expect(
        screenCard.getByRole("textbox", {
          name: "Restrição alimentar de Convidada Dois",
          exact: true,
        }),
      ).toHaveValue("Sem lactose");
      await expect(
        screenCard.getByRole("textbox", {
          name: "Observação de Convidada Dois",
          exact: true,
        }),
      ).toHaveValue("Chegaremos cedo");
      await page.getByRole("link", { name: "Início", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirmar presença", exact: true })
        .click();
      await expect(
        dialog.getByText(responseMessages[status], { exact: true }).last(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (status === "CONFIRMED") {
        await expect(
          dialog
            .getByRole("button", { name: "Adicionar à agenda", exact: true })
            .last(),
        ).toBeVisible();
        await page.screenshot({
          path: `/tmp/home-rsvp-${width}.png`,
          animations: "disabled",
        });
      }
    });
  }
}

test("Home retains offline RSVP, synchronizes once and dismisses on navigation", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await home(page, 390);
  await page
    .getByRole("button", { name: "Ver informações", exact: true })
    .click();
  await page.getByRole("link", { name: "Início", exact: true }).click();
  const before = await snapshot(page);
  const trigger = page.getByRole("button", {
    name: "Confirmar presença",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  const card = dialog
    .getByText("Convidada Dois", { exact: true })
    .locator("..");
  await context.setOffline(true);
  await expect(
    page
      .getByText(
        "Sem conexão · exibindo os últimos dados salvos neste dispositivo.",
        { exact: true },
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await card
    .getByRole("radio", { name: presenceChoices[0]!.label, exact: true })
    .click();
  await card
    .getByRole("button", { name: confirmationLabels.CONFIRMED, exact: true })
    .click();
  await expect(
    card.getByText(responseMessages.CONFIRMED, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", {
      name: responseContent.CONFIRMED.title,
      exact: true,
    }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await expect
    .poll(
      async () => (await snapshot(page)).applied.length - before.applied.length,
    )
    .toBe(1);
  await dialog
    .getByRole("button", { name: "Fechar modal", exact: true })
    .click();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/informacoes$/);
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
