import { test, expect } from "@playwright/test";
for (const width of [320, 390, 1280])
  test(`general notification review and permanent external-only publication at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page.getByRole("link", { name: "Notificações", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova notificação", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Nova notificação",
      exact: true,
    });
    await expect(
      editor.getByText(/Destinatários: todos os convidados elegíveis/).first(),
    ).toBeVisible();
    await expect(editor.getByRole("combobox")).toHaveCount(0);
    await expect(
      editor.getByRole("checkbox", { name: "WHATSAPP", exact: true }),
    ).toHaveCount(0);
    await editor
      .getByLabel("Título", { exact: true })
      .fill("Recado com carinho 💙");
    await editor
      .getByLabel("Mensagem", { exact: true })
      .fill("Primeiro parágrafo.\n\nSegundo parágrafo completo.");
    await editor.getByRole("checkbox", { name: "IN_APP", exact: true }).click();
    await editor.getByRole("checkbox", { name: "EMAIL", exact: true }).click();
    await editor
      .getByRole("button", { name: "Revisar notificação", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Confirmar notificação",
      exact: true,
    });
    await expect(review).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).snapshot
            .notification_publications?.length || 0,
      ),
    ).toBe(0);
    await expect(
      review.getByRole("button", { name: "Publicar e enviar", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `/tmp/general-notifications-${browserName}-review-${width}.png`,
      fullPage: true,
    });
    await review
      .getByRole("button", { name: "Publicar e enviar", exact: true })
      .click();
    await expect(review).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).snapshot
            .notification_publications.length,
      ),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Sair deste dispositivo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await expect(
      page.getByText("Recado com carinho 💙", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Noivos, em \d{2}\/\d{2}\/\d{4} às/),
    ).toBeVisible();
    const body = page.getByText(
      "Primeiro parágrafo.\n\nSegundo parágrafo completo.",
      { exact: true },
    );
    await expect(body).toBeVisible();
    await page
      .getByRole("button", { name: "Marcar recado como lido", exact: true })
      .click();
    await expect(
      page.getByText("Lido pela sua unidade", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Lido pela sua unidade", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await body.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/general-notifications-${browserName}-feed-${width}.png`,
      fullPage: true,
    });
  });
