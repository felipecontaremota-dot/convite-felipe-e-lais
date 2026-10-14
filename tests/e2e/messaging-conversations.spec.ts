import { test, expect, type Page } from "@playwright/test";
async function demo(page: Page, role = "noivos") {
  await page.goto("/");
  await page.getByRole("button", { name: `Demo ${role}`, exact: true }).click();
}
async function seed(page: Page) {
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const invitation = db.snapshot.invitations[0].id;
    const stamp = new Date().toISOString();
    db.snapshot.messages = [
      {
        id: "notice-general",
        event_id: db.snapshot.event.id,
        invitation_id: null,
        recipient_guest_id: null,
        recipient_guest_ids: db.snapshot.guests.map(
          (g: { id: string }) => g.id,
        ),
        sender_guest_id: null,
        sender_user_id: "demo",
        from_admin: true,
        audience: "GENERAL",
        content: "General wedding notice",
        created_at: stamp,
        read_at: null,
        channels: ["IN_APP"],
      },
      {
        id: "notice-private",
        event_id: db.snapshot.event.id,
        invitation_id: invitation,
        recipient_guest_id: null,
        sender_guest_id: null,
        sender_user_id: "demo",
        from_admin: true,
        audience: "PRIVATE",
        content: "Private wedding answer",
        created_at: stamp,
        read_at: null,
        channels: ["IN_APP"],
      },
    ];
    db.reads = {};
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
}
for (const width of [320, 375, 390, 768, 1280])
  test(`guest chat preserves route, categories and viewport at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await demo(page, "convidado");
    await seed(page);
    const balloon = page.getByRole("button", {
      name: /Deixe uma mensagem para o casal/,
    });
    await expect(balloon).toHaveAccessibleName(/2 mensagens não lidas/);
    const url = page.url();
    await balloon.click();
    const dialog = page.getByRole("dialog", {
      name: "Mensagens com Felipe & Laís",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(page.url()).toBe(url);
    await expect(
      dialog.getByText("Private wedding answer", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("General wedding notice", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const db = JSON.parse(localStorage.getItem("demo-db")!);
          return Object.keys(db.reads || {}).length;
        }),
      )
      .toBe(1);
    await dialog.getByRole("radio", { name: /Mensagens gerais/ }).click();
    await expect(
      dialog.getByText("General wedding notice", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Private wedding answer", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            Object.keys(
              JSON.parse(localStorage.getItem("demo-db")!).reads || {},
            ).length,
        ),
      )
      .toBe(2);
    await dialog.getByRole("radio", { name: /Nossa conversa/ }).click();
    await dialog
      .getByLabel("Mensagem aos noivos", { exact: true })
      .fill("Hello through our floating conversation");
    await dialog
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(
      dialog.getByText("Hello through our floating conversation", {
        exact: true,
      }),
    ).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    if (width >= 768) expect(box.x + box.width).toBeCloseTo(width - 16, 0);
    await expect(
      dialog.getByLabel("Mensagem aos noivos", { exact: true }),
    ).toHaveCSS("border-top-width", "1px");
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`chat-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(balloon).toBeFocused();
    await expect(balloon).not.toHaveAccessibleName(/não lidas/);
    await page.reload();
    await expect(balloon).not.toHaveAccessibleName(/não lidas/);
  });
test("admin unread badge, private answer and destructive deletion preserve the conversation", async ({
  page,
}) => {
  await demo(page, "convidado");
  await page
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  await page
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Guest private question");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await demo(page);
  await expect(
    page.getByRole("link", { name: "Mensagens, 1 não lidas.", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Mensagens/ }).click();
  await page
    .getByRole("button", { name: "Responder à família", exact: true })
    .click();
  const chat = page.getByRole("dialog", { name: /Conversa com/ });
  await expect(
    chat.getByText("Guest private question", { exact: true }),
  ).toBeVisible();
  await chat
    .getByLabel("Resposta dos noivos", { exact: true })
    .fill("Private answer from the couple");
  await chat
    .getByRole("button", { name: "Enviar resposta", exact: true })
    .click();
  await expect(
    chat.getByText("Private answer from the couple", { exact: true }),
  ).toBeVisible();
  await chat
    .getByRole("button", { name: "Excluir mensagem", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Excluir mensagem?",
    exact: true,
  });
  await expect(
    confirm.getByText(
      "Tem certeza que deseja excluir esta mensagem? Esta ação não poderá ser desfeita pela interface.",
      { exact: true },
    ),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    chat.getByText("Private answer from the couple", { exact: true }),
  ).toBeVisible();
  await chat
    .getByRole("button", { name: "Excluir mensagem", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir mensagem?", exact: true })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(
    chat.getByText("Private answer from the couple", { exact: true }),
  ).toHaveCount(0);
  await expect(
    chat.getByText("Guest private question", { exact: true }),
  ).toBeVisible();
});
test("notification date, channels, editing, pause and cancellation are persisted", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("link", { name: "Notificações", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova notificação", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Nova notificação",
    exact: true,
  });
  await modal
    .getByLabel("Título", { exact: true })
    .fill("Programmed announcement");
  await modal
    .getByLabel("Mensagem", { exact: true })
    .fill("Remember our wonderful day");
  await modal.getByLabel("Data", { exact: true }).fill("2027-01-10");
  await modal.getByLabel("Horário", { exact: true }).fill("16:00");
  await modal
    .getByRole("button", { name: "Salvar agendamento", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText("Agendada", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Editar notificação", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Editar notificação",
    exact: true,
  });
  await edit.getByLabel("Título", { exact: true }).fill("Edited announcement");
  await edit
    .getByRole("checkbox", { name: "Notificação ativa", exact: true })
    .click();
  await edit
    .getByRole("button", { name: "Salvar agendamento", exact: true })
    .click();
  await expect(page.getByText("Pausada", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Edited announcement", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar notificação", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancelar agendamento", exact: true })
    .click();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot
          .notification_schedules[0].scheduled_at,
    ),
  ).toBe("2027-01-10T19:00:00.000Z");
});

test("calendar labels remain Portuguese even in an English browser", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("link", { name: "Notificações", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova notificação", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Nova notificação",
    exact: true,
  });
  await modal.getByLabel("Data", { exact: true }).fill("10/01/2027");
  await modal
    .getByRole("button", { name: "Escolher data", exact: true })
    .click();
  const calendar = modal.getByRole("group", {
    name: "Calendário em português",
    exact: true,
  });
  await expect(
    calendar.getByText("janeiro de 2027", { exact: true }),
  ).toBeVisible();
  await expect(calendar.getByText("Sáb", { exact: true })).toBeVisible();
  await calendar
    .getByRole("button", { name: "11 de janeiro de 2027", exact: true })
    .click();
  await expect(calendar).toHaveCount(0);
  await expect(modal.getByLabel("Data", { exact: true })).toHaveValue(
    "11/01/2027",
  );
  await modal
    .getByRole("button", { name: "Escolher data", exact: true })
    .click();
  await calendar
    .getByRole("button", { name: "Próximo mês", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(modal).toBeVisible();
});

test("offline guest send remains pending, reconnects once and never increments own unread count", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page, "convidado");
  const balloon = page.getByRole("button", {
    name: /Deixe uma mensagem para o casal/,
  });
  await balloon.click();
  const modal = page.getByRole("dialog", {
    name: "Mensagens com Felipe & Laís",
    exact: true,
  });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await modal
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Offline conversation request");
  await modal
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    modal.getByText(/Offline conversation request · Pendente de sincronização/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.length,
    ),
  ).toBe(0);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    modal.getByText("Offline conversation request", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.filter(
          (m: { content: string }) =>
            m.content === "Offline conversation request",
        ).length,
    ),
  ).toBe(1);
  await page.keyboard.press("Escape");
  await expect(balloon).not.toHaveAccessibleName(/não lidas/);
  await page.reload();
  await balloon.click();
  await expect(
    modal.getByText("Offline conversation request", { exact: true }),
  ).toBeVisible();
});

test("keyboard viewport keeps the composer reachable and general notices never expose a public reply box", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      height: 844,
      offsetTop: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page, "convidado");
  await page
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Mensagens com Felipe & Laís",
    exact: true,
  });
  await dialog.getByRole("radio", { name: /Mensagens gerais/ }).click();
  await expect(
    dialog.getByLabel("Mensagem aos noivos", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("radio", { name: /Nossa conversa/ }).click();
  await page.evaluate(() => {
    const viewport = window.visualViewport as unknown as {
      height: number;
      dispatchEvent: (e: Event) => void;
    };
    viewport.height = 420;
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(
      async () =>
        (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height,
    )
    .toBeLessThanOrEqual(420);
  const field = dialog.getByLabel("Mensagem aos noivos", { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.fill("Typing while the keyboard is open");
  const box = (await field.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(420);
  const send = dialog.getByRole("button", {
    name: "Enviar mensagem",
    exact: true,
  });
  await send.scrollIntoViewIfNeeded();
  expect(
    (await send.boundingBox())!.y + (await send.boundingBox())!.height,
  ).toBeLessThanOrEqual(420);
  await send.click();
  await expect(
    dialog.getByText("Typing while the keyboard is open", { exact: true }),
  ).toBeVisible();
});
