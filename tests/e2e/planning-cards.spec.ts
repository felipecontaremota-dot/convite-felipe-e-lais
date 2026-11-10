import { test, expect } from "@playwright/test";

for (const width of [320, 390, 768, 1280])
  test(`planning progress cards, independent actions and keyboard at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const event = "00000000-0000-4000-8000-000000000001";
      const vendors = [
        ["Zero", 0, 0],
        ["Inicial", 10000, 0],
        ["Parcial", 10000, 2500],
        ["Rezzet Films", 440000, 286000],
        ["AirBnb", 246200, 246200],
      ].map(([name, total_cents, paid], i) => ({
        id: `vendor-${i}`,
        event_id: event,
        name,
        total_cents,
        paid,
        details: {},
        plan_type: "INSTALLMENTS",
        version: 1,
        deleted_at: null,
      }));
      const dues = vendors
        .filter((v) => v.total_cents)
        .flatMap((v) =>
          [0, 1].map((n) => ({
            id: `${v.id}-${n}`,
            event_id: event,
            vendor_id: v.id,
            label: `Parcela ${n + 1}`,
            amount_cents: Number(v.total_cents) / 2,
            due_on: `2026-10-${20 + n}`,
            position: n,
            deleted_at: null,
          })),
        );
      const payments = vendors
        .filter((v) => v.paid)
        .flatMap((v) =>
          [0, 1].map((n) => ({
            id: `payment-${v.id}-${n}`,
            event_id: event,
            vendor_id: v.id,
            due_id: `${v.id}-${n}`,
            amount_cents: Number(v.paid) / 2,
            paid_on: `2026-10-${20 + n}`,
            method: "PIX",
            notes: "",
            version: 1,
            deleted_at: null,
          })),
        );
      localStorage.setItem(
        `demo-planning-simple-${event}`,
        JSON.stringify({
          vendors,
          dues,
          payments,
          budget: null,
          legacy_count: 0,
        }),
      );
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Planejamento do Casamento", exact: true })
      .click();
    await page
      .getByRole("radio", { name: "Fornecedores", exact: true })
      .click();
    const supplier = page
      .locator('[data-planning-card="supplier"]')
      .filter({ hasText: "Rezzet Films" });
    const badge = supplier.locator("[data-planning-progress-badge]");
    await expect(badge).toHaveText("65%");
    for (const [name, value] of [
      ["Zero", "0%"],
      ["Inicial", "0%"],
      ["Parcial", "25%"],
      ["AirBnb", "100%"],
    ])
      await expect(
        page
          .locator('[data-planning-card="supplier"]')
          .filter({ hasText: name! })
          .locator("[data-planning-progress-badge]"),
      ).toHaveText(value!);
    await expect(
      page.getByText("Abrir fornecedor Rezzet Films", { exact: true }),
    ).toHaveCount(0);
    const cardBox = await supplier.boundingBox(),
      badgeBox = await badge.boundingBox();
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(
      cardBox!.x + cardBox!.width,
    );
    expect(badgeBox!.x).toBeGreaterThan(cardBox!.x + cardBox!.width / 2);
    expect(badgeBox!.y - cardBox!.y).toBeLessThan(30);
    await supplier.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`suppliers-${width}.png`),
      fullPage: true,
    });
    const open = supplier.getByRole("button", {
      name: "Abrir fornecedor Rezzet Films",
      exact: true,
    });
    await open.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(open).toBeFocused();
    expect(await open.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      "solid",
    );
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("dialog", { name: "Rezzet Films", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // A useful corner of the card is also the primary action.
    await supplier.click({ position: { x: 12, y: 12 } });
    await expect(
      page.getByRole("dialog", { name: "Rezzet Films", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "Pagamentos", exact: true }).click();
    const cards = page
      .locator('[data-planning-card="payment"]')
      .filter({ hasText: "Rezzet Films" });
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all())
      await expect(card.locator("[data-planning-progress-badge]")).toHaveText(
        "65%",
      );
    await expect(
      page.getByText("Editar pagamento de Rezzet Films", { exact: true }),
    ).toHaveCount(0);
    const payment = cards.first();
    await payment
      .getByRole("button", {
        name: "Cancelar pagamento de Rezzet Films",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Cancelar registro de pagamento",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Registrar pagamento", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    const edit = payment.getByRole("button", {
      name: "Editar pagamento de Rezzet Films",
      exact: true,
    });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Registrar pagamento", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Valor pago", exact: true }),
    ).toHaveValue("1.430,00");
    await page.keyboard.press("Escape");
    await payment.click({ position: { x: 12, y: 12 } });
    await expect(
      page.getByRole("dialog", { name: "Registrar pagamento", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const paymentBox = await payment.boundingBox();
    const paymentBadge = await payment
      .locator("[data-planning-progress-badge]")
      .boundingBox();
    expect(paymentBadge!.x).toBeGreaterThan(
      paymentBox!.x + paymentBox!.width / 2,
    );
    expect(paymentBadge!.x + paymentBadge!.width).toBeLessThanOrEqual(
      paymentBox!.x + paymentBox!.width,
    );
    expect(paymentBadge!.y - paymentBox!.y).toBeLessThan(30);
    await payment.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`payments-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await page.locator("button button").count()).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await payment
        .locator("[data-planning-progress-badge]")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    expect(errors).toEqual([]);
  });
