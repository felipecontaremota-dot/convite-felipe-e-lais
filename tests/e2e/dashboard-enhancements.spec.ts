import { expect, test } from "@playwright/test";
import { dashboardTooltips } from "../../src/features/admin/dashboardTooltips";
for (const width of [320, 1280]) {
  test(`all fourteen metric explanations and independent help targets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await expect(page.locator("[data-metric]")).toHaveCount(14);
    const contained = await page.locator("[data-metric]").evaluateAll((nodes) =>
      nodes.every((node) => {
        const outer = node.getBoundingClientRect(),
          inner = node.firstElementChild!.getBoundingClientRect();
        return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      }),
    );
    expect(contained).toBe(true);
    for (const [label, text] of Object.entries(dashboardTooltips)) {
      const help = page.getByRole("button", {
        name: `Sobre ${label}`,
        exact: true,
      });
      await help.click();
      await expect(page.getByRole("tooltip")).toHaveText(text);
      expect(new URL(page.url()).pathname).toBe("/painel");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const box = await page.getByRole("tooltip").boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
    const card = page.getByRole("button", { name: /^Confirmados:/ });
    await card.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      dashboardTooltips.Confirmados!,
    );
    await card.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-admin-modal]")).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `/tmp/dashboard-tooltips-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test(`dashboard guest rows reuse canonical links, email guard and admin-only actions at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const g = db.snapshot.guests[0];
      g.group_label = "Convidado(a) da noiva";
      g.invitation_sent = true;
      db.snapshot.guests = [g];
      db.snapshot.rsvps = [
        { guest_id: g.id, status: "CONFIRMED", responded_at: "2026-01-01" },
      ];
      db.snapshot.contacts = [{ guest_id: g.id, email: "" }];
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Convidados da noiva: 1", exact: true })
      .click();
    const dialog = page.getByRole("dialog"),
      row = dialog.locator("[data-dashboard-guest]");
    await expect(
      row.getByText("Convidado(a) da noiva", { exact: true }),
    ).toBeVisible();
    await expect(row.getByText("Enviado", { exact: true })).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem("demo-db"));
    await row.getByRole("button", { name: /Copiar link/ }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("/c/");
    const canonical = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("demo-db")!).snapshot;
      return s.invitations.find(
        (i: { id: string }) => i.id === s.guests[0].invitation_id,
      ).sharing_code;
    });
    expect(copied.endsWith(`/c/${canonical}`)).toBe(true);
    await row.getByRole("button", { name: /Enviar convite/ }).click();
    await expect(
      dialog.getByText("Este convidado não possui e-mail cadastrado.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("demo-db"))).toBe(
      before,
    );
    await page.screenshot({
      path: `/tmp/dashboard-actions-${width}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Sair deste dispositivo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await expect(page.locator("[data-dashboard-guest]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Enviar convite para/ }),
    ).toHaveCount(0);
  });
}
