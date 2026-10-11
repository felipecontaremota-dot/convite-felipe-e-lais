import { test, expect } from "@playwright/test";

test("Home personalizes the access unit, reads RSVP and keeps both button routes and dynamic countdown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date("2026-10-10T19:00:00Z") });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await expect(
    page.getByText("Bem-vindos, Convidado Um e família", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Faltam 66 dias até o "Sim"', { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(86400000);
  await expect(
    page.getByText('Faltam 65 dias até o "Sim"', { exact: true }),
  ).toBeVisible();
  for (const form of ["MASCULINE", "FEMININE", null]) {
    await page.evaluate((form) => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const s = db.snapshot;
      s.invitations[0].kind = "INDIVIDUAL";
      s.guests = [{ ...s.guests[0], name: "Alex", greeting_form: form }];
      s.rsvps = [];
      localStorage.setItem("demo-db", JSON.stringify(db));
    }, form);
    await page.reload();
    await expect(
      page.getByText(
        `${form === "MASCULINE" ? "Bem-vindo" : form === "FEMININE" ? "Bem-vinda" : "Boas-vindas"}, Alex`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  for (const [status, responded_at, message] of [
    ["CONFIRMED", null, "Sua presença está confirmada."],
    ["DECLINED", null, "Sua ausência foi confirmada, sentiremos sua falta."],
    ["PENDING", null, "Sua presença ainda não foi confirmada."],
    [
      "PENDING",
      "2026-10-10T19:00:00Z",
      "Ainda dá tempo de você confirmar sua presença.",
    ],
  ] as const) {
    await page.evaluate(
      ({ status, responded_at }) => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        db.snapshot.rsvps = [
          {
            guest_id: db.snapshot.guests[0].id,
            event_id: db.snapshot.event.id,
            status,
            responded_at,
            dietary: "",
            note: "",
            source: "APP",
          },
        ];
        localStorage.setItem("demo-db", JSON.stringify(db));
      },
      { status, responded_at },
    );
    await page.reload();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.invitations[0].kind = "FAMILY";
    db.snapshot.invitations[0].primary_guest_id = null;
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await expect(
    page.getByText("Bem-vindos, Família Demo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Ainda dá tempo de você confirmar a sua presença e de sua família.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const statuses = [
      "CONFIRMED",
      "CONFIRMED",
      "DECLINED",
      "PENDING",
      "PENDING",
    ];
    db.snapshot.guests = statuses.map((_, index) => ({
      ...db.snapshot.guests[0],
      id: `member-${index}`,
      name: `Member ${index}`,
    }));
    db.snapshot.invitations[0].primary_guest_id = "member-0";
    db.snapshot.rsvps = statuses.map((status, index) => ({
      guest_id: `member-${index}`,
      event_id: db.snapshot.event.id,
      status,
      responded_at: index === 3 ? null : "2026-10-10T19:00:00Z",
      dietary: "",
      note: "",
      source: "APP",
    }));
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await expect(
    page.getByText("Bem-vindos, Member 0 e família", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "2 presenças confirmadas · 1 ausência confirmada · 1 ainda não confirmada · 1 ainda decidindo",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).applied.length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Informar contatos", exact: true })
    .click();
  await expect(page).toHaveURL(/\/perfil$/);
  await page.goto("/inicio");
  await page
    .getByRole("button", { name: "Ver meus convites", exact: true })
    .click();
  await expect(page).toHaveURL(/\/ingressos$/);
});
