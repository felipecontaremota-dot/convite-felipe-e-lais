import { test, expect } from "@playwright/test";
for (const width of [390, 1440]) {
  test(`public home has a name and password and the shared countdown at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    await page.clock.setFixedTime(new Date("2026-12-15T18:59:50Z"));
    await page.goto("/");
    await expect(page.getByRole("textbox")).toHaveCount(2);
    await expect(
      page.getByLabel("Senha do convite", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Nossa próxima aventura", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Código do convite", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Voltar", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("wedding-countdown")).toHaveAttribute(
      "aria-label",
      "Contagem regressiva: 0 dias, 0 horas, 0 minutos e 10 segundos",
    );
    await page.clock.setFixedTime(new Date("2026-12-15T18:59:51Z"));
    await page.clock.runFor(1000);
    await expect(page.getByTestId("wedding-countdown")).toHaveAttribute(
      "aria-label",
      "Contagem regressiva: 0 dias, 0 horas, 0 minutos e 9 segundos",
    );
    const submit = page.getByRole("button", {
      name: "Abrir convite",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Nome do convidado").fill("felipe de sousa alencar");
    await expect(page.getByLabel("Nome do convidado")).toHaveValue(
      "FELIPE DE SOUSA ALENCAR",
    );
    await page.getByLabel("Senha do convite").fill("0047");
    await expect(submit).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", {
        name: "Acesso dos noivos e cerimonial",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
  });
}
