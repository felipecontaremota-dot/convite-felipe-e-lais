import { test, expect, type Page } from "@playwright/test";
import {
  presenceChoices,
  confirmationLabels,
  responseMessages,
} from "../../src/features/rsvp/presenceContent";
async function presence(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Presença", exact: true }).click();
  return page
    .getByText("Convidada Dois", { exact: true })
    .filter({ visible: true })
    .locator("..");
}
for (const status of ["CONFIRMED", "DECLINED", "PENDING"] as const) {
  test(`confirmed ${status} uses bounded FX, sequential dialogs and never replays after refresh`, async ({
    page,
  }) => {
    const card = await presence(page);
    await card
      .getByRole("radio", {
        name: presenceChoices.find((o) => o.value === status)!.label,
        exact: true,
      })
      .click();
    await card
      .getByRole("button", { name: confirmationLabels[status], exact: true })
      .click();
    const fx = page.locator(`[data-rsvp-fx="${status}"]`);
    await expect(fx).toBeVisible();
    expect(await fx.locator("span").count()).toBeLessThanOrEqual(20);
    const response = page.getByRole("dialog", {
      name: "Sua resposta",
      exact: true,
    });
    await expect(response).toBeVisible();
    await expect(fx).toHaveCount(0);
    await expect(
      response.getByText(responseMessages[status], { exact: true }),
    ).toBeVisible();
    expect(
      await response
        .getByText(responseMessages[status], { exact: true })
        .evaluate((el) => getComputedStyle(el).textAlign),
    ).toBe("center");
    await expect(page.locator("[data-admin-modal]")).toHaveCount(1);
    await expect(response.getByRole("button")).toHaveCount(1);
    await response
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    const compose = page.getByRole("dialog", {
      name: "Deixe uma mensagem para os noivos 💌",
      exact: true,
    });
    await expect(compose).toBeVisible();
    await expect(response).toHaveCount(0);
    await compose.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(compose).toHaveCount(0);
    await expect(
      card.getByText(responseMessages[status], { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("Sincronizado com sucesso.", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
  });
}
test("message is optional, validates trimmed length, retains text after failure and sends once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await presence(page);
  await card
    .getByRole("button", { name: confirmationLabels.PENDING, exact: true })
    .click();
  const response = page.getByRole("dialog", {
    name: "Sua resposta",
    exact: true,
  });
  await expect(response).toBeVisible();
  await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
  await response
    .getByRole("button", { name: "Fechar modal", exact: true })
    .click();
  const compose = page.getByRole("dialog", {
    name: "Deixe uma mensagem para os noivos 💌",
    exact: true,
  });
  await expect(compose).toBeVisible();
  const field = compose.getByPlaceholder(
    "Deixe uma mensagem para os noivos (opcional)",
  );
  const send = compose.getByRole("button", { name: "Enviar", exact: true });
  for (const value of ["", "     ", "abcd", "  abcd  "]) {
    await field.fill(value);
    await expect(send).toBeDisabled();
  }
  await field.fill("  Muito amor!  ");
  await expect(send).toBeEnabled();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("queue:") && v.includes("MESSAGE_SEND"))
        throw new Error("Fixture storage failed");
      return original.call(this, k, v);
    };
  });
  await send.click();
  await expect(compose.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue("  Muito amor!  ");
  await expect(compose).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { restoreStorage: () => void }).restoreStorage(),
  );
  await send.evaluate((el) => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(compose).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.filter(
          (m: { content: string }) => m.content === "Muito amor!",
        ).length,
    ),
  ).toBe(1);
});
test("rejected RSVP never celebrates or opens success dialogs", async ({
  page,
}) => {
  const card = await presence(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("queue:") && v.includes("RSVP_UPDATE"))
        throw new Error("Fixture storage failed");
      return original.call(this, k, v);
    };
  });
  await card
    .getByRole("button", { name: confirmationLabels.PENDING, exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
});
for (const width of [320, 375, 390, 768, 1280])
  test(`compact header and manual video remain responsive at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await expect(
      page.getByTestId("compact-countdown").filter({ visible: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(
      page.getByTestId("compact-countdown").filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText(/Contatos são opcionais/)).toHaveCount(0);
    await expect(page.getByText(/A revogação passa a valer/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Ativar notificações para/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Assistir ao nosso vídeo",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("video")).not.toHaveAttribute("src", /mp4/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const countdown = page
      .getByTestId("compact-countdown")
      .filter({ visible: true });
    const before = await countdown.textContent();
    await expect.poll(() => countdown.textContent()).not.toBe(before);
  });

test("queued message retries its existing mutation without a second message", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await presence(page);
  await card
    .getByRole("button", { name: confirmationLabels.PENDING, exact: true })
    .click();
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
  await compose
    .getByPlaceholder("Deixe uma mensagem para os noivos (opcional)")
    .fill("Recado offline único");
  await context.setOffline(true);
  await page.waitForTimeout(300);
  await compose.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    compose.getByText(
      "Salvo neste dispositivo. Será sincronizado quando houver conexão.",
      { exact: true },
    ),
  ).toBeVisible();
  const queued = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("queue:"))
        .flatMap((k) => JSON.parse(localStorage.getItem(k)!))
        .filter((m: { type: string }) => m.type === "MESSAGE_SEND"),
    );
  expect(await queued()).toHaveLength(1);
  await compose.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(compose.getByRole("alert")).toBeVisible();
  expect(await queued()).toHaveLength(1);
  await context.setOffline(false);
  await expect.poll(queued).toHaveLength(0);
  await compose.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(compose).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.filter(
          (m: { content: string }) => m.content === "Recado offline único",
        ).length,
    ),
  ).toBe(1);
});
test("navigation during FX cancels only the presentation and retains the saved RSVP", async ({
  page,
}) => {
  const card = await presence(page);
  await card
    .getByRole("button", { name: confirmationLabels.PENDING, exact: true })
    .click();
  await expect(page.locator("[data-rsvp-fx]")).toBeVisible();
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  await expect(page.locator("[data-rsvp-fx]")).toHaveCount(0);
  await page.waitForTimeout(2300);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Presença", exact: true }).click();
  await expect(
    card.getByText(responseMessages.PENDING, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("manual header player uses the existing sound, close and replay without navigation", async ({
  page,
}) => {
  await page.route("**/pedido-casamento-web.mp4", () => {});
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      get: () => 4,
    });
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await presence(page);
  const play = page.getByRole("button", {
    name: "Assistir ao nosso vídeo",
    exact: true,
  });
  await expect(play).toBeVisible();
  await expect(page.locator("video")).not.toHaveAttribute("src", /mp4/);
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await expect(page.locator("video")).toHaveAttribute("playsinline", "");
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.muted),
  ).toBe(true);
  await page.getByRole("button", { name: "Ativar som", exact: true }).click();
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.muted),
  ).toBe(false);
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  await play.click();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page.locator("video")).not.toHaveAttribute("src", /mp4/);
});

test("family description stays conservative when only local identity is known", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await page
    .getByRole("radio", { name: "Convidada Dois", exact: true })
    .click();
  await page.getByRole("link", { name: "Convites", exact: true }).click();
  await expect(
    page.getByText(
      "Um convite individual por pessoa confirmada, inclusive crianças. Abra os convites antes do Grande Dia.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Emitir novo convite", exact: true })
      .first(),
  ).toBeVisible();
});
test("message controls stay reachable in a short mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await presence(page);
  await card
    .getByRole("button", { name: confirmationLabels.PENDING, exact: true })
    .click();
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
  await compose
    .getByPlaceholder("Deixe uma mensagem para os noivos (opcional)")
    .focus();
  for (const name of ["Fechar", "Enviar"]) {
    const button = compose.getByRole("button", { name, exact: true });
    const box = await button.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420);
  }
});
