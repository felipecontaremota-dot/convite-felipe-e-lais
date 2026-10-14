import { test, expect } from "@playwright/test";
for (const width of [390, 1280]) {
  test(`Individual invitation confirmation preserves credentials and Home layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await expect(page.getByLabel("Monograma Felipe & Laís")).toBeVisible();
    await expect(page.getByText("· Às 16h", { exact: true })).toBeVisible();
    await expect(page.getByText("Convidado Um", { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({ path: `/tmp/home-visual-${width}.png` });
    await page
      .getByRole("button", { name: "Ver meus convites", exact: true })
      .click();
    const qr = page.getByLabel("Convite individual de Convidado Um", {
      exact: true,
    });
    await expect(qr).toBeVisible();
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.credentials,
    );
    const issue = page.getByRole("button", {
      name: "Emitir novo convite",
      exact: true,
    });
    await issue.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText(
        "Tem certeza que deseja emitir um novo ingresso? Essa ação irá invalidar o anterior",
        { exact: true },
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(issue).toBeFocused();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.credentials,
      ),
    ).toEqual(before);
    await issue.click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.credentials,
      ),
    ).toEqual(before);
    await issue.click();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Convite salvo", { exact: true }),
    ).toBeVisible();
    const after = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.credentials,
    );
    expect(
      after.filter((c: { revoked_at: string | null }) => !c.revoked_at),
    ).toHaveLength(1);
    expect(after).not.toEqual(before);
    await expect(
      page.getByText("Convite da família", { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.event.venue_name = "Villarejo";
      db.snapshot.event.address =
        "Av. Dr. Joaquim Craveiro de Sá, 1000 - Expansul, Aparecida de Goiânia - GO, 74986-320";
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.getByRole("link", { name: "Local", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Abrir localização", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "99", exact: true }),
    ).toBeVisible();
    const address = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.event.address,
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { text: string }) => {
          (window as unknown as { shared: string }).shared = data.text;
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copied: string }).copied = text;
          },
        },
      });
    });
    await page.getByRole("button", { name: "99", exact: true }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { shared: string }).shared,
      ),
    ).toBe(address);
    await page
      .getByRole("button", { name: "Copiar endereço", exact: true })
      .click();
    await expect(
      page.getByText("Endereço copiado", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toBe(address);
    await page.screenshot({ path: `/tmp/local-visual-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByText("Link de localização aberto.", { exact: true }),
    ).toHaveCount(0);
  });
}
