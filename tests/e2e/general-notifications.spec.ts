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
    await expect(page.getByText("Lido", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Lido", { exact: true })).toBeVisible();
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

test("a scheduled time expiring during review shows an error without publishing or crashing", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await page.getByRole("link", { name: "Notificações", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova notificação", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Nova notificação",
    exact: true,
  });
  await editor
    .getByLabel("Título", { exact: true })
    .fill("Agendamento vencido na revisão");
  await editor
    .getByLabel("Mensagem", { exact: true })
    .fill("Não deve publicar.");
  await editor
    .getByRole("radio", { name: "Agendar envio", exact: true })
    .click();
  await editor.getByLabel("Data", { exact: true }).fill("2026-10-25");
  await editor.getByLabel("Horário", { exact: true }).fill("09:01");
  await editor
    .getByRole("button", { name: "Revisar notificação", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Confirmar notificação",
    exact: true,
  });
  await expect(review).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-10-25T12:02:00Z"));
  await review
    .getByRole("button", { name: "Salvar agendamento", exact: true })
    .click();
  await expect(review.getByRole("alert").last()).toContainText(
    "Escolha uma data futura.",
  );
  await review.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue(
    "Agendamento vencido na revisão",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot
          .notification_schedules?.length || 0,
    ),
  ).toBe(0);
});

for (const width of [320, 1280])
  test(`ADMIN confirms or cancels soft deletion and GUEST cannot restore it at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.notification_publications = [
        {
          id: "publication-delete",
          title: "Recado removível",
          content: "Remover apenas este recado.",
          published_at: new Date().toISOString(),
          origin: "MANUAL",
          viewer_read_at: null,
        },
        {
          id: "publication-keep",
          title: "Recado preservado",
          content: "Manter.",
          published_at: new Date().toISOString(),
          origin: "MANUAL",
          viewer_read_at: null,
        },
      ];
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.getByRole("link", { name: "Notificações", exact: true }).click();
    await page.reload();
    const trash = page.getByRole("button", {
      name: "Excluir notificação: Recado removível",
      exact: true,
    });
    await trash.click();
    let modal = page.getByRole("dialog", {
      name: "Excluir notificação?",
      exact: true,
    });
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(trash).toBeVisible();
    await trash.click();
    modal = page.getByRole("dialog", {
      name: "Excluir notificação?",
      exact: true,
    });
    await modal
      .getByRole("button", { name: "Excluir notificação", exact: true })
      .click();
    await expect(trash).toHaveCount(0);
    await expect(page.getByText(/Excluída em /)).toBeVisible();
    await page
      .getByText("Recado removível", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/notification-deletion-${browserName}-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Sair deste dispositivo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await expect(
      page.getByText("Recado removível", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Recado preservado", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Excluir notificação/ }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("Recado removível", { exact: true }),
    ).toHaveCount(0);
  });
