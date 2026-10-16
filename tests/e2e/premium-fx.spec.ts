import { test, expect, type Page } from "@playwright/test";
async function admin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
async function clipboard(page: Page, fail = false) {
  await page.evaluate((fail) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          if (fail) throw new Error("Clipboard blocked");
        },
      },
    });
  }, fail);
}
test("guest copy is local, truthful, reusable and keeps row layout", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await clipboard(page);
  const buttons = page.getByRole("button", {
    name: /Copiar link do convite de/,
  });
  const first = buttons.first();
  const before = await first.boundingBox();
  await first.click();
  await expect(first.getByText("Link copiado", { exact: true })).toBeVisible();
  await expect(first).toBeDisabled();
  await expect(page.locator(".fx-toast")).toHaveCount(0);
  await expect(
    buttons.nth(1).getByText("Link copiado", { exact: true }),
  ).toHaveCount(0);
  const after = await first.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
  await expect(first).toBeEnabled();
  await clipboard(page, true);
  await first.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(first.getByText("Link copiado", { exact: true })).toHaveCount(0);
  await clipboard(page);
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first.getByText("Link copiado", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("guest hover and selected row share the same subtle color", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  const row = page.locator("[data-guest-row]").first();
  await row.hover();
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(234, 242, 250, 0.6)");
  await row.getByRole("checkbox").click();
  await page.getByRole("heading", { name: "Convidados", exact: true }).hover();
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(234, 242, 250, 0.6)");
});
for (const role of ["noivos", "convidado"]) {
  test(`shared Local and timed copy toast for ${role} at 320px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: `Demo ${role}`, exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      Object.assign(db.snapshot.event, {
        venue_name: "Villarejo Eventos",
        address: "Rua do Evento, 12",
      });
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await page.getByRole("link", { name: "Local", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Editar local", exact: true }),
    ).toHaveCount(role === "noivos" ? 1 : 0);
    await clipboard(page);
    await page
      .getByRole("button", { name: "Abrir localização", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Abrir localização", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Copiar endereço", exact: true })
      .click();
    const toast = page.locator(".fx-toast");
    await expect(toast).toHaveText("Endereço copiado");
    await expect(toast).toHaveAttribute("data-phase", "visible");
    const box = await toast.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.y).toBeLessThan(50);
    await page.waitForTimeout(700);
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await clipboard(page, true);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Abrir localização", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Copiar endereço", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(toast).toHaveCount(0);
  });
}
test("demo email never claims a real send and reduced motion retains feedback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Envio demonstrativo");
  await page.getByLabel("E-mail", { exact: true }).fill("demo@example.test");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  const send = page.getByRole("button", {
    name: "Enviar convite para Envio demonstrativo",
    exact: true,
  });
  await send.click();
  await expect(
    send.getByText("Envio não realizado", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("E-mail enviado", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Demonstração: nenhum e-mail foi enviado.", { exact: true }),
  ).toBeVisible();
});

test("clipboard confirms only after resolution and duplicate clicks do not repeat the operation", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page.evaluate(() => {
    const state = { calls: 0, release: () => {} };
    const pending = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    (window as unknown as { clipboardState: typeof state }).clipboardState =
      state;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          state.calls++;
          await pending;
        },
      },
    });
  });
  const button = page
    .getByRole("button", { name: /Copiar link do convite de/ })
    .first();
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await button.dispatchEvent("click");
  await expect(button.getByText("Link copiado", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { clipboardState: { calls: number } })
          .clipboardState.calls,
    ),
  ).toBe(1);
  await page.evaluate(() =>
    (
      window as unknown as { clipboardState: { release: () => void } }
    ).clipboardState.release(),
  );
  await expect(button.getByText("Link copiado", { exact: true })).toBeVisible();
});

test("canonical RSVP and child tags render their semantic colors", async ({
  page,
}) => {
  await admin(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.guests[2].is_child = true;
    db.snapshot.rsvps[2].status = "DECLINED";
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  for (const [label, background] of [
    ["Confirmado", "rgb(232, 245, 237)"],
    ["Não irá", "rgb(252, 237, 238)"],
    ["Pendente", "rgb(234, 242, 250)"],
    ["Criança", "rgb(255, 242, 229)"],
  ]) {
    const tag = page
      .locator("[data-guest-row]")
      .getByText(label, { exact: true });
    await expect(tag).toBeVisible();
    expect(
      await tag.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(background);
  }
});
