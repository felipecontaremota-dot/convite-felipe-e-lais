import { test, expect } from "@playwright/test";
const footer =
  "Com carinho, Felipe & Laís · Seus dados são usados para organizar o casamento.";
for (const width of [320, 390, 1280]) {
  test(`Location offers one destination and maps/transport without changing event at ${width}px`, async ({
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
    ).toHaveCount(1);
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
    await expect(
      page.getByRole("button", { name: "Waze", exact: true }),
    ).toHaveCount(0);
    const overflowBefore = await page.evaluate(
      () => document.body.style.overflow,
    );
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Abrir localização",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await expect(
      dialog.getByRole("button", { name: "99", exact: true }),
    ).toBeVisible();
    for (const [label, expected] of [
      [
        "Google Maps",
        "https://www.google.com/maps/dir/?api=1&destination=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012",
      ],
      [
        "Waze",
        "https://waze.com/ul?q=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012&navigate=yes",
      ],
      [
        "Uber",
        "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012",
      ],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      expect(
        await page.evaluate(() =>
          (window as unknown as { opened: string[] }).opened.at(-1),
        ),
      ).toBe(expected);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      overflowBefore,
    );
    await open.click();
    await dialog
      .getByRole("button", { name: "Fechar modal", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await open.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    const logo = page.getByRole("link", {
      name: "Visitar o Instagram do Villarejo Eventos",
    });
    await expect(logo).toHaveAttribute(
      "href",
      "https://www.instagram.com/villarejoeventos?vrfl=M2tpa292Nzc5bDBz",
    );
    await expect(logo).toHaveAttribute("target", "_blank");
    await expect(logo).toHaveAttribute("rel", "noopener noreferrer");
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
        name: "Revogar permissão de receber mensagens e notificações",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("Location without GPS still offers Waze, Uber and Google web fallback", async ({
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
  for (const name of ["Waze", "Uber", "99", "Google Maps"])
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

for (const width of [320, 1280]) {
  test(`Location modal respects reduced motion and keyboard focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.event.address = "Rua do Evento, 12";
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.goto("/como-chegar");
    await page
      .getByRole("button", { name: "Abrir localização", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Abrir localização",
      exact: true,
    });
    const close = dialog.getByRole("button", {
      name: "Fechar modal",
      exact: true,
    });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "99", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    expect(
      await dialog.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/tmp/location-modal-${width}.png` });
    await close.click();
    await expect(dialog).toHaveCount(0);
  });
}
