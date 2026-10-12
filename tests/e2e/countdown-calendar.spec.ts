import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("countdown ticks, recalculates after suspension/reload and reaches zero across device timezones", async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: "America/New_York",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-12-15T18:49:55Z") });
  await page.clock.setFixedTime(new Date("2026-12-15T18:49:55Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  const counter = page.getByTestId("wedding-countdown");
  await expect(counter).toHaveAttribute(
    "aria-label",
    "Contagem regressiva: 0 dias, 0 horas, 10 minutos e 5 segundos",
  );
  await expect(page.getByText("· Às 16h", { exact: true })).toBeVisible();
  await expect(page.getByText(/Faltam.*dias até/)).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-12-15T18:49:56Z"));
  await page.clock.runFor(1000);
  await expect(counter).toHaveAttribute(
    "aria-label",
    "Contagem regressiva: 0 dias, 0 horas, 10 minutos e 4 segundos",
  );
  await page.clock.setFixedTime(new Date("2026-12-15T18:55:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(counter).toHaveAttribute(
    "aria-label",
    "Contagem regressiva: 0 dias, 0 horas, 5 minutos e 0 segundos",
  );
  await page.reload();
  await expect(counter).toHaveAttribute(
    "aria-label",
    "Contagem regressiva: 0 dias, 0 horas, 5 minutos e 0 segundos",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(counter).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-12-15T19:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Chegou o nosso Sim. ❤️", { exact: true }),
  ).toBeVisible();
  await expect(counter).toHaveCount(0);
  await page.clock.fastForward(60000);
  await expect(
    page.getByText("Chegou o nosso Sim. ❤️", { exact: true }),
  ).toBeVisible();
  await context.close();
});

test("positive RSVP remains saved independently of calendar choices and returns after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Presença", exact: true }).click();
  const card = page
    .getByText("Convidada Dois", { exact: true })
    .filter({ visible: true })
    .locator("..");
  const agenda = card.getByRole("button", {
    name: "Adicionar à agenda",
    exact: true,
  });
  await expect(agenda).toHaveCount(0);
  await card
    .getByRole("radio", { name: "Já tô com a roupa de ir!!!", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Pode reservar meu lugar! 🎉", exact: true })
    .click();
  await expect(
    card.getByText("Sincronizado com sucesso.", { exact: true }),
  ).toBeVisible();
  await expect(agenda).toBeVisible();
  const status = () =>
    page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
      return s.rsvps.find(
        (r: { guest_id: string }) => r.guest_id === s.guests[1].id,
      ).status;
    });
  expect(await status()).toBe("CONFIRMED");
  await agenda.click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(await status()).toBe("CONFIRMED");
  await page.reload();
  await expect(agenda).toBeVisible();
  await agenda.click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar calendário (.ics)", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("casamento-felipe-e-lais.ics");
  const content = await readFile((await download.path())!, "utf8");
  expect(content).toContain("SUMMARY:Casamento Felipe & Laís");
  expect(content).toContain("DTSTART:20261215T190000Z");
  expect(content).not.toContain("DTEND");
  expect(await status()).toBe("CONFIRMED");
  await agenda.click();
  await page
    .context()
    .route("https://calendar.google.com/**", (route) =>
      route.fulfill({ body: "fixture calendar" }),
    );
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Google Agenda", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  const params = new URL(popup.url()).searchParams;
  expect(params.get("text")).toBe("Casamento Felipe & Laís");
  expect(params.get("dates")).toBe("20261215T190000Z/20261215T190000Z");
  expect(params.get("ctz")).toBe("America/Sao_Paulo");
  await popup.close();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  for (const [label, submit] of [
    ["Vou deixar meu lugar pra outro sortudo!", "Pode passar minha vez! 💔"],
    ["Vou ver e te aviso...", "Deixa eu fazer um suspense... 🕓"],
  ]) {
    await card
      .getByRole("button", { name: "Editar minha confirmação", exact: true })
      .click();
    await card.getByRole("radio", { name: label, exact: true }).click();
    await card.getByRole("button", { name: submit, exact: true }).click();
    await expect(
      card.getByRole("button", {
        name: "Editar minha confirmação",
        exact: true,
      }),
    ).toBeVisible();
    await expect(agenda).toHaveCount(0);
  }
});
