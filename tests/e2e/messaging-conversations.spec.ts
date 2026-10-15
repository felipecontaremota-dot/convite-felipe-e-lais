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
  test(`guest unified chat preserves route, receipts and viewport at ${width}px`, async ({
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
    ).toBeVisible();
    await expect(
      dialog.getByText("Felipe & Laís para todos", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Felipe & Laís para você", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(
      dialog.getByText(/Conversa privada da sua unidade/),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(
              JSON.parse(localStorage.getItem("demo-db")!).reads || {},
            ).length,
        ),
      )
      .toBe(2);
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
    page.getByRole("button", { name: "Mensagens, 1 não lidas.", exact: true }),
  ).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: /^Mensagens,/ }).click();
  await expect(page).toHaveURL(url);
  const list = page.getByRole("dialog", {
    name: "Mensagens dos convidados",
    exact: true,
  });
  await expect(
    list.getByRole("button", {
      name: "Família Demo, 1 não lidas",
      exact: true,
    }),
  ).toBeVisible();
  await list
    .getByRole("button", { name: "Família Demo, 1 não lidas", exact: true })
    .click();
  const chat = page.getByRole("dialog", { name: "Família Demo", exact: true });
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

test("keyboard viewport keeps the unified private composer reachable", async ({
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
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(
    dialog.getByLabel("Mensagem aos noivos", { exact: true }),
  ).toBeVisible();
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

for (const width of [320, 1280])
  test(`administrative floating center preserves route and sends a general message at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await demo(page);
    const url = page.url();
    const balloon = page.getByRole("button", {
      name: "Mensagens dos convidados",
      exact: true,
    });
    await balloon.click();
    const list = page.getByRole("dialog", {
      name: "Mensagens dos convidados",
      exact: true,
    });
    await expect(list).toBeVisible();
    const openGeneral = list.getByRole("button", {
      name: "Enviar mensagem para todos",
      exact: true,
    });
    await openGeneral.focus();
    await expect(
      list.getByRole("tooltip", {
        name: "Enviar mensagem para todos",
        exact: true,
      }),
    ).toBeVisible();
    await openGeneral.click();
    const general = page.getByRole("dialog", {
      name: "Mensagens para todos",
      exact: true,
    });
    await expect(page.locator('[data-admin-modal="true"]')).toHaveCount(1);
    await expect(page).toHaveURL(url);
    await expect(
      general.getByText(
        "Por aqui vocês poderão enviar mensagem para todos os convidados",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(general.getByRole("checkbox")).toHaveCount(4);
    await general
      .getByLabel("Mensagem para todos", { exact: true })
      .fill("Recado geral do novo balão");
    await general
      .getByRole("button", { name: "Enviar mensagem para todos", exact: true })
      .click();
    await expect(
      general.getByText("Recado geral do novo balão", { exact: true }),
    ).toBeVisible();
    await expect(
      general.getByText("Sincronizado com sucesso.", { exact: true }),
    ).toHaveCount(0);
    await expect(
      general.getByRole("button", { name: "Fechar modal", exact: true }),
    ).toHaveCSS("border-top-width", "0px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`admin-general-${width}.png`),
    });
    await general
      .getByRole("button", { name: "Voltar às conversas", exact: true })
      .click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(balloon).toBeFocused();
  });

test("opening the unified chat acknowledges only messages actually visible, never the entire history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "convidado");
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const unit = db.snapshot.invitations[0].id;
    db.snapshot.messages = Array.from({ length: 16 }, (_, n) => ({
      id: `visible-message-${n}`,
      event_id: db.snapshot.event.id,
      invitation_id: unit,
      recipient_guest_id: null,
      sender_guest_id: null,
      sender_user_id: "demo",
      from_admin: true,
      audience: "PRIVATE",
      content: `Recado ${n}. ` + "Texto da conversa. ".repeat(12),
      created_at: new Date(Date.UTC(2026, 9, 14, 12, n)).toISOString(),
      read_at: null,
      channels: ["IN_APP"],
    }));
    db.reads = {};
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await page
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(JSON.parse(localStorage.getItem("demo-db")!).reads)
            .length,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        Object.keys(JSON.parse(localStorage.getItem("demo-db")!).reads).length,
    ),
  ).toBeLessThan(16);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Deixe uma mensagem para o casal/ }),
  ).toHaveAccessibleName(/não lidas/);
});

test("message retry stays idempotent when an unrelated queued operation still fails", async ({
  page,
}) => {
  await demo(page, "convidado");
  await page
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  const chat = page.getByRole("dialog", {
    name: "Mensagens com Felipe & Laís",
    exact: true,
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let first = true;
    Storage.prototype.setItem = function (key, value) {
      if (
        first &&
        key === "demo-db" &&
        value.includes("Mensagem com retry isolado")
      ) {
        first = false;
        throw Error("Fixture failed first message write");
      }
      return original.call(this, key, value);
    };
  });
  const field = chat.getByLabel("Mensagem aos noivos", { exact: true });
  await field.fill("Mensagem com retry isolado");
  await chat
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(field).toHaveValue("Mensagem com retry isolado");
  await expect(
    chat.getByText(/Falha de sincronização — mensagem pendente/),
  ).toBeVisible();
  const queued = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) =>
        k.startsWith("queue:") &&
        localStorage.getItem(k)!.includes("Mensagem com retry isolado"),
    )!;
    const rows = JSON.parse(localStorage.getItem(key)!);
    rows.push({
      mutationId: "fixture-unrelated-denied",
      type: "CHECKIN_CREATE",
      payload: { guest_id: "other" },
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
    localStorage.setItem(key, JSON.stringify(rows));
    return rows[0].mutationId;
  });
  await chat
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(field).toHaveValue("");
  await expect(
    chat.getByText("Mensagem com retry isolado", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.filter(
          (m: { content: string }) =>
            m.content === "Mensagem com retry isolado",
        ).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem("demo-db")!).applied.filter(
          (value: string) => value === id,
        ).length,
      queued,
    ),
  ).toBe(1);
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/1 alteração aguardando sincronização/),
  ).toBeVisible();
});

test("legacy Responder keeps the selected historical message as the reply anchor", async ({
  page,
}) => {
  await demo(page);
  const expected = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const unit = db.snapshot.invitations[0].id;
    const members = db.snapshot.guests.filter(
      (g: { invitation_id: string }) => g.invitation_id === unit,
    );
    db.snapshot.messages = members
      .slice(0, 2)
      .map((g: { id: string }, n: number) => ({
        id: `anchor-${n}`,
        event_id: db.snapshot.event.id,
        invitation_id: unit,
        sender_guest_id: g.id,
        sender_user_id: "demo",
        recipient_guest_id: null,
        from_admin: false,
        audience: "PRIVATE",
        content: n ? "Pergunta mais recente" : "Pergunta histórica selecionada",
        created_at: new Date(Date.UTC(2026, 9, 14, 12, n)).toISOString(),
        read_at: null,
        channels: ["IN_APP"],
      }));
    localStorage.setItem("demo-db", JSON.stringify(db));
    return members[0].id;
  });
  await page.goto("/gestao-mensagens");
  await page
    .getByText("Pergunta histórica selecionada", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Responder", exact: true })
    .click();
  const chat = page.getByRole("dialog", { name: "Família Demo", exact: true });
  await chat
    .getByLabel("Resposta dos noivos", { exact: true })
    .fill("Resposta da mensagem selecionada");
  await chat
    .getByRole("button", { name: "Enviar resposta", exact: true })
    .click();
  await expect(
    chat.getByText("Resposta da mensagem selecionada", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.messages.find(
          (m: { content: string }) =>
            m.content === "Resposta da mensagem selecionada",
        ).recipient_guest_id,
    ),
  ).toBe(expected);
});

test("administrative keyboard viewport keeps reply and persistent back control reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page);
  await page
    .getByRole("button", { name: "Mensagens dos convidados", exact: true })
    .click();
  const list = page.getByRole("dialog", {
    name: "Mensagens dos convidados",
    exact: true,
  });
  await list.getByRole("button", { name: "Família Demo", exact: true }).click();
  const chat = page.getByRole("dialog", { name: "Família Demo", exact: true });
  await page.evaluate(() => {
    const v = window.visualViewport as unknown as {
      height: number;
      dispatchEvent: (event: Event) => void;
    };
    v.height = 420;
    v.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const b = (await chat.boundingBox())!;
      return b.y + b.height;
    })
    .toBeLessThanOrEqual(420);
  await expect(
    chat.getByRole("button", { name: "Voltar às conversas", exact: true }),
  ).toBeVisible();
  const field = chat.getByLabel("Resposta dos noivos", { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.fill("Recado com teclado aberto");
  const send = chat.getByRole("button", {
    name: "Enviar resposta",
    exact: true,
  });
  await send.scrollIntoViewIfNeeded();
  const b = (await send.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(420);
  await send.click();
  await expect(
    chat.getByText("Recado com teclado aberto", { exact: true }),
  ).toBeVisible();
});
