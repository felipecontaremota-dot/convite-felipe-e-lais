import { test, expect } from "@playwright/test";
const footer =
  "Com carinho, Felipe & Laís · Seus dados são usados para organizar o casamento.";
for (const width of [390, 1280]) {
  test(`Location offers configured destination and explicit maps without changing event at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      Object.assign(db.snapshot.event, {
        venue_name: "Villarejo Eventos",
        address: "Rua São João, 12",
        gps_url: "https://maps.test/local",
        latitude: -23,
        longitude: -46,
      });
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.goto("/como-chegar");
    await page.reload();
    const eventBefore = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.event,
    );
    await expect(
      page.getByRole("heading", { name: "Villarejo Eventos", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Rua São João, 12", { exact: true }),
    ).toHaveCount(2);
    await page.evaluate(() => {
      (window as unknown as { opened: string[] }).opened = [];
      window.open = (url) => {
        (window as unknown as { opened: string[] }).opened.push(String(url));
        return null;
      };
    });
    const open = page.getByRole("button", {
      name: "Abrir localização",
      exact: true,
    });
    await open.focus();
    await page.keyboard.press("Enter");
    for (const [label, expected] of [
      ["Abrir link de localização configurado", "https://maps.test/local"],
      [
        "Abrir no Google Maps",
        "https://www.google.com/maps/dir/?api=1&destination=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012",
      ],
      [
        "Abrir no Waze",
        "https://waze.com/ul?q=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012&navigate=yes",
      ],
      [
        "Abrir no Apple Maps",
        "https://maps.apple.com/?daddr=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012",
      ],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      expect(
        await page.evaluate(() =>
          (window as unknown as { opened: string[] }).opened.at(-1),
        ),
      ).toBe(expected);
    }
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.event,
      ),
    ).toEqual(eventBefore);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("demo-db")!).applied.length,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByText(footer, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Consentimentos podem ser revogados no Perfil/),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(
      page.getByText(footer, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    const contact = page
      .getByRole("textbox", { name: "E-mail de Convidado Um", exact: true })
      .locator("..")
      .locator("..");
    await expect(
      contact.getByRole("checkbox", {
        name: "Aceito receber mensagens por email",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("Location without GPS still offers Waze, Apple Maps and Google web fallback", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.event.address = "Rua do Evento, 12";
    db.snapshot.event.gps_url = "javascript:alert(1)";
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.goto("/como-chegar");
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Abrir link de localização configurado",
      exact: true,
    }),
  ).toHaveCount(0);
  for (const name of [
    "Abrir no Waze",
    "Abrir no Apple Maps",
    "Abrir no Google Maps",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
});

for (const role of ["noivos", "cerimonial"]) {
  test(`Shared footer is consistent for ${role}`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: `Demo ${role}`, exact: true })
      .click();
    await expect(
      page.getByText(footer, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Consentimentos podem ser revogados no Perfil/),
    ).toHaveCount(0);
  });
}
