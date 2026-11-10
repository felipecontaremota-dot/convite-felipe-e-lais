import { test, expect } from "@playwright/test";
for (const width of [320, 390, 768, 1280])
  test(`ceremonial notes, shared indicator, accessible tooltip and offline at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo cerimonial", exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const s = db.snapshot,
        g = s.guests[0],
        unit = s.invitations[0];
      s.invitations = [
        { ...unit, kind: "FAMILY", active: true, name: "Clenis e família" },
        {
          ...unit,
          id: "individual",
          kind: "INDIVIDUAL",
          active: true,
          name: "Ágata",
        },
      ];
      s.guests = [
        {
          ...g,
          id: "noted-z",
          name: "Zélia Silva",
          group_label: "Convidado(a) da noiva",
          admin_notes: "Chegará acompanhada.\nVerificar transporte.",
        },
        {
          ...g,
          id: "noted-a",
          invitation_id: "individual",
          name: "Ágata Silva",
          group_label: "Convidado(a) do noivo",
          admin_notes:
            "Orientação dos noivos " + "com texto extenso ".repeat(50),
        },
        ...["", "   ", null, undefined].map((note, n) => ({
          ...g,
          id: `blank-${n}`,
          name: `Sem anotação ${n}`,
          admin_notes: note,
        })),
      ];
      s.rsvps = s.guests.map((person: { id: string }) => ({
        event_id: s.event.id,
        guest_id: person.id,
        status: "CONFIRMED",
        dietary: "Uma restrição não é uma nota",
        note: "RSVP também não é uma nota",
      }));
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Observações", exact: true }),
    ).toBeVisible();
    const links = await page.getByRole("link").allTextContents();
    expect(links.indexOf("Observações")).toBe(links.indexOf("Padrinhos") + 1);
    expect(links.indexOf("Lista de convidados")).toBe(
      links.indexOf("Observações") + 1,
    );
    await page.getByRole("link", { name: "Observações", exact: true }).click();
    const noted = page
      .locator('[data-noted-guest="noted-z"]')
      .filter({ visible: true });
    const title = noted.getByText("Zélia Silva", { exact: true });
    await expect(title).toBeVisible();
    const card = noted;
    await expect(
      card.getByText("Clenis e família", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("Confirmado", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Convidado(a) da noiva", { exact: true }),
    ).toBeVisible();
    const bold = card.getByText("Chegará acompanhada.\nVerificar transporte.", {
      exact: true,
    });
    expect(
      Number(await bold.evaluate((el) => getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(700);
    await expect(page.getByText(/Sem anotação/)).toHaveCount(0);
    const orderedNames = await page
      .locator("[data-noted-guest]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-noted-guest")),
      );
    expect(orderedNames).toEqual(["noted-a", "noted-z"]);
    await expect(
      page
        .locator('[data-noted-guest="noted-a"]')
        .getByText("Clenis e família", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await noted.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`notes-${width}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Lista de convidados", exact: true })
      .click();
    const icon = page.getByRole("button", {
      name: "Observação de Zélia Silva",
      exact: true,
    });
    await expect(icon).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Observação de Sem anotação/ }),
    ).toHaveCount(0);
    await icon.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toHaveText(
      "Chegará acompanhada.\nVerificar transporte.",
    );
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await icon.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await icon.click();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    const long = page.getByRole("button", {
      name: "Observação de Ágata Silva",
      exact: true,
    });
    await long.click();
    await expect(tooltip).toContainText("Orientação dos noivos");
    const box = await tooltip.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1001);
    await page.screenshot({
      path: info.outputPath(`note-tooltip-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await context.setOffline(true);
    await page.getByRole("link", { name: "Observações", exact: true }).click();
    await expect(title).toBeVisible();
    await context.setOffline(false);
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.guests.forEach(
        (g: { admin_notes: string }) => (g.admin_notes = ""),
      );
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await expect(
      page.getByText("Nenhum convidado possui observações cadastradas.", {
        exact: true,
      }),
    ).toBeVisible();
  });

test("a guest cannot open the operational notes route", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.goto("/observacoes");
  await expect(
    page.getByText(
      "Acesso restrito. Abra seu convite ou entre com sua conta autorizada.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator("[data-noted-guest]")).toHaveCount(0);
});
