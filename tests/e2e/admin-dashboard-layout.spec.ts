import { expect, test } from "@playwright/test";

const order = [
  "Confirmados",
  "Na lista",
  "Convidados",
  "Talvez irão",
  "Não irão",
  "Famílias",
  "Crianças",
  "Convidados da noiva",
  "Convidados do noivo",
  "Lista de presentes",
  "Mensagens não lidas",
  "Check-ins",
  "Convites não enviados",
  "Famílias já ativadas",
];
for (const width of [320, 390, 768, 1280]) {
  test(`ADMIN hierarchy, shared header and responsive rows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    const metrics = page.locator("[data-metric]");
    await expect(metrics).toHaveCount(14);
    expect(
      await metrics.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-metric")),
      ),
    ).toEqual(order);
    const hero = page.getByRole("button", { name: /^Confirmados:/ });
    await expect(hero).toHaveCount(1);
    await expect(hero).toHaveCSS("background-color", "rgb(36, 93, 145)");
    await expect(
      hero.getByText("convidados confirmados", { exact: true }),
    ).toBeVisible();
    await expect(hero.locator(":scope > div").first()).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    await expect(
      page.getByRole("button", { name: "Sobre Confirmados", exact: true }),
    ).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(
      page.getByRole("link", { name: "Presentes", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-metric="Presentes"]')).toHaveCount(0);
    const boxes = await metrics.evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
        };
      }),
    );
    expect(boxes[0]!.width).toBeCloseTo(Math.min(width, 1120) - 48, 0);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(width);
      expect(b.height).toBeGreaterThan(44);
    }
    if (width === 1280) {
      for (const row of [
        boxes.slice(1, 5),
        boxes.slice(5, 11),
        boxes.slice(11),
      ]) {
        expect(new Set(row.map((b) => b.y)).size).toBe(1);
        expect(
          Math.max(...row.map((b) => b.width)) -
            Math.min(...row.map((b) => b.width)),
        ).toBeLessThan(1);
      }
      expect(boxes[5]!.y).toBeGreaterThan(boxes[1]!.y);
      expect(boxes[11]!.y).toBeGreaterThan(boxes[5]!.y);
    }
    const counter = page
      .getByTestId("compact-countdown")
      .filter({ visible: true });
    await expect(counter).toBeVisible();
    const date = counter
      .locator("..")
      .getByText("15 · 12 · 2026", { exact: true });
    await expect(date).toBeVisible();
    for (const number of await counter
      .getByTestId("compact-countdown-number")
      .all())
      await expect(number).toHaveCSS("color", "rgb(121, 87, 25)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `/tmp/admin-hierarchy-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("ADMIN countdown shares guest target, ticks, refreshes and clamps at zero; CEREMONIALIST unchanged", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-15T18:49:55Z") });
  await page.clock.setFixedTime(new Date("2026-12-15T18:49:55Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  const counter = page
    .getByTestId("compact-countdown")
    .filter({ visible: true });
  const values = () =>
    counter.getByTestId("compact-countdown-number").allTextContents();
  await expect.poll(values).toEqual(["00", "00", "10", "05"]);
  await page.clock.setFixedTime(new Date("2026-12-15T18:49:56Z"));
  await page.clock.runFor(1000);
  await expect.poll(values).toEqual(["00", "00", "10", "04"]);
  await page.reload();
  await expect.poll(values).toEqual(["00", "00", "10", "04"]);
  await page.clock.setFixedTime(new Date("2026-12-15T19:01:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(values).toEqual(["00", "00", "00", "00"]);
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Demo cerimonial", exact: true })
    .click();
  await expect(counter).toHaveCount(0);
  await expect(
    page.getByText("15 · 12 · 2026", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});
