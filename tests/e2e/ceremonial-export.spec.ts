import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readPdf } from "../support/pdf";
import { readSheet } from "read-excel-file/node";
import { TestPostgres } from "../support/postgres";
import { ticketFixture } from "../support/ticket-fixture";
const db = new TestPostgres();
let f: ReturnType<typeof ticketFixture>;
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  f = ticketFixture(db);
  const version = Number(
    db.sql(`select version from guests where id='${f.a.id}'`).trim(),
  );
  f.action("GUEST_UPDATE", {
    id: f.a.id,
    version,
    name: "Ágata Operacional",
    group_label: "Convidado(a) da noiva",
    admin_notes: "Nota original dos noivos",
    email: "restricted@example.test",
    whatsapp: "62999999999",
  });
  f.action("GUEST_INVITATION_SENT_SET", {
    id: f.a.id,
    sent: true,
    expected_sent: false,
  });
});
test.afterAll(() => db.stop());
async function login(page: Page, uid: string) {
  const enc = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url"),
    exp = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    email: "operator@example.test",
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    try {
      const data = path.startsWith("/auth/")
        ? path.endsWith("/user")
          ? user
          : session
        : path.startsWith("/rest/v1/rpc/")
          ? db.rpc(
              uid,
              path.split("/").at(-1)!,
              route.request().postDataJSON() || {},
            )
          : {};
      await route.fulfill({ json: data });
    } catch {
      await route.fulfill({
        status: 403,
        json: { message: "unauthorized", code: "42501" },
      });
    }
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(uid === f.admin ? /\/painel$/ : /\/inicio$/);
}
for (const width of [320, 390, 768, 1280])
  test(`restricted operational Excel/PDF and notes update at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page, f.staff);
    await page.getByRole("link", { name: "Observações", exact: true }).click();
    const note = page
      .locator(`[data-noted-guest="${f.a.id}"]`)
      .filter({ visible: true });
    await expect(note).toContainText("Nota original dos noivos");
    const updated = db
      .rpc(f.admin, "app_snapshot", { p_event: f.event })
      .guests.find((g: { id: string }) => g.id === f.a.id);
    f.action("GUEST_UPDATE", {
      id: updated.id,
      version: updated.version,
      name: updated.name,
      group_label: updated.group_label,
      email: "restricted@example.test",
      whatsapp: "62999999999",
      admin_notes: "Orientação atualizada pelos noivos",
    });
    await page.reload();
    await expect(note).toContainText("Orientação atualizada pelos noivos");
    await page
      .getByRole("link", { name: "Lista de convidados", exact: true })
      .click();
    const trigger = page.getByRole("button", {
      name: "Baixar lista de convidados",
      exact: true,
    });
    const choose = async () => {
      await trigger.click();
      const filters = page.getByRole("dialog", {
        name: "Filtrar lista de convidados",
        exact: true,
      });
      await filters
        .getByRole("checkbox", { name: "Convites enviados", exact: true })
        .click();
      await expect(filters).toContainText("1 convidados encontrados");
      await filters
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
    };
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/rpc/guest_list_export"),
    );
    await choose();
    const payload = await (await response).json();
    expect(JSON.stringify(payload)).not.toMatch(
      /"(pin|sharing_code|code_hash|token_hash|email|whatsapp)"/,
    );
    const modal = page.getByRole("dialog", {
      name: "Baixar lista de convidados",
      exact: true,
    });
    await expect(modal.getByText(/restritos aos noivos/)).toBeVisible();
    let download = page.waitForEvent("download");
    await modal
      .getByRole("button", { name: "Excel (.xlsx)", exact: true })
      .click();
    let file = await download;
    const sheet = await readSheet((await file.path())!, "Convidados");
    expect(sheet[5]?.[1]).toBe("Ágata Operacional");
    for (const c of [2, 4, 5, 7]) expect(sheet[5]?.[c] ?? null).toBe(null);
    expect(JSON.stringify(sheet)).not.toContain("restricted@example.test");
    await choose();
    download = page.waitForEvent("download");
    await modal
      .getByRole("button", { name: "PDF (.pdf)", exact: true })
      .click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = readFileSync((await file.path())!);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = await readPdf(pdf);
    const text = pages.map((p) => p.text).join(" ");
    expect(text).toContain("Ágata Operacional");
    expect(text).toContain("OBSERVAÇÃO: Orientação atualizada pelos noivos");
    expect(text).toContain(
      "1 convidados confirmados | 0 Padrinhos | 1 Observações",
    );
    expect(text).not.toMatch(
      /restricted@example.test|62999999999|WhatsApp|E-mail|Senha/,
    );
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page
      .getByRole("dialog", { name: "Filtrar lista de convidados", exact: true })
      .evaluate(async (node) => {
        await Promise.all(
          document
            .getAnimations()
            .filter((a) => {
              const target = (a.effect as KeyframeEffect | null)?.target;
              return (
                target instanceof Element &&
                target.contains(node) &&
                a.effect?.getComputedTiming().iterations !== Infinity
              );
            })
            .map((a) => a.finished.catch(() => {})),
        );
      });
    await page.screenshot({
      path: info.outputPath(`ceremonial-export-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await context.setOffline(true);
    await expect(trigger).toBeDisabled();
    await context.setOffline(false);
    const cache = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith("cache:"))
        .map(([, v]) => JSON.parse(v)),
    );
    expect(JSON.stringify(cache)).not.toContain("restricted@example.test");
    expect(JSON.stringify(cache)).not.toMatch(/"pin"|"sharing_code"/);
    // Restore the fixture for the next viewport, without changing real data.
    const g = db
      .rpc(f.admin, "app_snapshot", { p_event: f.event })
      .guests.find((g: { id: string }) => g.id === f.a.id);
    f.action("GUEST_UPDATE", {
      id: g.id,
      version: g.version,
      name: g.name,
      group_label: g.group_label,
      email: "restricted@example.test",
      whatsapp: "62999999999",
      admin_notes: "Nota original dos noivos",
    });
  });
