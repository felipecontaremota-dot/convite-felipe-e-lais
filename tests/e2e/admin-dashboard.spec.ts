import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const s = db.snapshot,
      originalGuest = s.guests[0],
      originalInvitation = s.invitations[0];
    s.invitations = [
      {
        ...originalInvitation,
        id: "family-a",
        kind: "FAMILY",
        name: "Família Alfa",
        active: true,
        sent_at: null,
        pin: "SECRET-PIN",
        sharing_code: "SECRET-CODE",
        first_activated_at: "2026-01-01",
      },
      {
        ...originalInvitation,
        id: "family-b",
        kind: "FAMILY",
        name: "Família Beta",
        active: true,
        sent_at: "2026-01-01",
        first_activated_at: null,
      },
    ];
    s.guests = [
      "Ana Confirmada",
      "Bruno Ausente",
      "Carla Indecisa",
      "Davi Pendente",
    ].map((name, i) => ({
      ...originalGuest,
      id: `person-${i}`,
      invitation_id: i < 2 ? "family-a" : "family-b",
      name,
      invitation_sent: i >= 2,
    }));
    s.rsvps = ["CONFIRMED", "DECLINED", "PENDING", "PENDING"].map(
      (status, i) => ({
        guest_id: `person-${i}`,
        event_id: s.event.id,
        status,
        responded_at: i === 3 ? null : "2026-01-01",
        dietary: "",
        note: "",
      }),
    );
    s.messages = [];
    s.checkins = [];
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
}
const categories = [
  [
    "Convidados",
    "Convidados com convite enviado",
    ["Carla Indecisa", "Davi Pendente"],
  ],
  ["Confirmados", "Convidados confirmados", ["Ana Confirmada"]],
  ["Não irão", "Convidados que não irão", ["Bruno Ausente"]],
  ["Pendentes", "Convidados pendentes", ["Davi Pendente"]],
  ["Talvez irão", "Convidados que talvez irão", ["Carla Indecisa"]],
  [
    "Convites não enviados",
    "Convites não enviados",
    ["Ana Confirmada", "Bruno Ausente"],
  ],
] as const;
for (const width of [320, 1280]) {
  test(`Dashboard drilldowns match counts, preserve data and are accessible at ${width}px`, async ({
    page,
  }) => {
    await setup(page, width);
    const before = await page.evaluate(() => localStorage.getItem("demo-db"));
    for (const [label, title, names] of categories) {
      const card = page.getByRole("button", {
        name: `${label}: ${names.length}`,
        exact: true,
      });
      await card.focus();
      await page.keyboard.press(label === "Confirmados" ? "Enter" : "Space");
      const dialog = page.getByRole("dialog", {
        name: `${title} — ${names.length}`,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.locator("[data-dashboard-guest]")).toHaveCount(
        names.length,
      );
      for (const name of names)
        await expect(dialog.getByText(name, { exact: true })).toBeVisible();
      await expect(dialog.getByText(/SECRET|@|https:\/\//)).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(
        "hidden",
      );
      await dialog
        .getByRole("button", { name: "Fechar modal", exact: true })
        .focus();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "Fechar modal", exact: true }),
      ).toBeFocused();
      if (label === "Confirmados") await page.keyboard.press("Escape");
      else if (label === "Não irão") await page.mouse.click(2, 2);
      else
        await dialog
          .getByRole("button", { name: "Fechar modal", exact: true })
          .click();
      await expect(dialog).toHaveCount(0);
      // DashboardDetailsModal restores focus in requestAnimationFrame after unmount.
      // Its synchronous modal cleanup can already satisfy toBeFocused before that
      // deferred restoration runs, stealing focus from the next card's Space press.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(card).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
        "hidden",
      );
    }
    for (const label of ["Presentes", "Check-ins", "Famílias já ativadas"])
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}:`) }),
      ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("demo-db"))).toBe(
      before,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/dashboard-${width}.png`,
      animations: "disabled",
    });
    for (const [label, count, path] of [
      ["Na lista", 4, "/convidados"],
      ["Famílias", 2, "/familias"],
      ["Mensagens não lidas", 0, "/gestao-mensagens"],
    ] as const) {
      await page
        .getByRole("button", { name: `${label}: ${count}`, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.goto("/painel");
    }
  });
}

test("Dashboard updates after refresh and shows every empty category", async ({
  page,
}) => {
  await setup(page, 390);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.rsvps[2].status = "CONFIRMED";
    db.snapshot.guests.forEach((g: { invitation_sent: boolean }) => {
      g.invitation_sent = true;
    });
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Confirmados: 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Talvez irão: 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Convites não enviados: 0", exact: true }),
  ).toBeVisible();
  for (const [label, title, , empty] of [
    [
      "Confirmados",
      "Convidados confirmados",
      "",
      "Nenhum convidado confirmou presença até o momento.",
    ],
    [
      "Não irão",
      "Convidados que não irão",
      "",
      "Nenhum convidado informou que não poderá comparecer.",
    ],
    [
      "Pendentes",
      "Convidados pendentes",
      "",
      "Todos os convidados já responderam!",
    ],
    [
      "Talvez irão",
      "Convidados que talvez irão",
      "",
      "Nenhum convidado está indeciso no momento.",
    ],
    [
      "Convites não enviados",
      "Convites não enviados",
      "",
      "Todos os convites já foram enviados!",
    ],
  ]) {
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.guests = [];
      db.snapshot.rsvps = [];
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await page
      .getByRole("button", { name: `${label}: 0`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `${title} — 0`,
      exact: true,
    });
    await expect(dialog.getByText(empty!, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("An open dashboard list follows the existing snapshot refresh and scrolls internally", async ({
  page,
}) => {
  await setup(page, 320);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Confirmados: 1", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Convidados confirmados — 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const template = db.snapshot.guests[0];
    db.snapshot.guests = Array.from({ length: 120 }, (_, i) => ({
      ...template,
      id: `large-${i}`,
      name: `Pessoa ${String(i).padStart(3, "0")}`,
    }));
    db.snapshot.rsvps = db.snapshot.guests.map((g: { id: string }) => ({
      guest_id: g.id,
      event_id: db.snapshot.event.id,
      status: "CONFIRMED",
      responded_at: "2026-01-01",
    }));
    localStorage.setItem("demo-db", JSON.stringify(db));
    window.dispatchEvent(new Event("focus"));
  });
  const dialog = page.getByRole("dialog", {
    name: "Convidados confirmados — 120",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-dashboard-guest]")).toHaveCount(120);
  const last = dialog.getByText("Pessoa 119", { exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  const box = await dialog.boundingBox(),
    row = await last.boundingBox();
  expect(row!.y).toBeGreaterThanOrEqual(box!.y);
  expect(row!.y + row!.height).toBeLessThanOrEqual(box!.y + box!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/dashboard-list-320.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Na lista: 120", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmados: 120", exact: true }),
  ).toBeVisible();
});
