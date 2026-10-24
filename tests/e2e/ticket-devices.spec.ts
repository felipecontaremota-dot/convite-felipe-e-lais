import { test, expect, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { TestPostgres } from "../support/postgres";
import { ticketFixture } from "../support/ticket-fixture";
const db = new TestPostgres();
prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(
      "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    ),
  },
});
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
});
test.afterAll(() => db.stop());
async function backend(page: Page, uid: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  await page.addInitScript((uid) => {
    if (localStorage.getItem("sb-127-auth-token")) return;
    const exp = Math.floor(Date.now() / 1000) + 3600,
      enc = (v: unknown) =>
        btoa(JSON.stringify(v))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, role: "authenticated", exp })}.fixture`,
        refresh_token: "fixture",
        expires_at: exp,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: uid,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
        },
      }),
    );
  }, uid);
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    try {
      if (path.startsWith("/auth/")) {
        await route.fulfill({
          json: {
            id: uid,
            aud: "authenticated",
            role: "authenticated",
            is_anonymous: true,
          },
        });
        return;
      }
      const fn = path.split("/").at(-1)!;
      calls.push({ fn, args });
      await route.fulfill({ json: db.rpc(uid, fn, args) });
    } catch (error) {
      const message = String(error).includes("ticket_changed")
        ? "ticket_changed"
        : String(error).includes("ticket_exists")
          ? "ticket_exists"
          : "unauthorized";
      await route.fulfill({ status: 400, json: { code: "P0001", message } });
    }
  });
  return calls;
}
async function decode(page: Page, name: string, path?: string) {
  const qr = page.getByLabel(`Convite individual de ${name}`, { exact: true });
  await expect(qr).toBeVisible();
  const svg = qr.locator("svg");
  await expect(svg).toHaveAttribute("width", "190");
  await expect(svg).toHaveAttribute("height", "190");
  // A user can scroll the code clear of the existing floating-message intro.
  // Center the actual SVG before checking pixels, without hiding any UI.
  await svg.evaluate((el) =>
    el.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    }),
  );
  const box = await svg.boundingBox();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  const imagePath = path || `/tmp/qr-decode-${randomUUID()}.png`;
  const screenshot = await qr.screenshot({
    path: imagePath,
    animations: "disabled",
  });
  const decoded = await readBarcodes(new Uint8Array(screenshot), {
    formats: ["QRCode"],
  });
  expect(decoded, imagePath).toHaveLength(1);
  expect(decoded[0]!.text).toMatch(/^wedding:\/\/ticket\/[a-f0-9]{64}$/);
  return decoded[0]!.text.slice(17);
}
for (const width of [320, 390, 1280])
  test(`individual QR survives reload and explicit device replacement at ${width}px`, async ({
    browser,
    browserName,
  }) => {
    test.setTimeout(120000);
    const f = ticketFixture(db);
    db.rpc(f.admin, "wedding_party_admin_set", {
      p_event: f.event,
      p_guest: f.b.id,
      p_role: "MADRINHA",
      p_expected_cycle: null,
    });
    const contextA = await browser.newContext({
      baseURL: "http://127.0.0.1:8083",
      viewport: { width, height: 900 },
      deviceScaleFactor: width < 600 ? 3 : 1,
    });
    const contextB = await browser.newContext({
      baseURL: "http://127.0.0.1:8083",
      viewport: { width, height: 900 },
    });
    try {
      const a = await contextA.newPage(),
        b = await contextB.newPage(),
        errors: string[] = [];
      a.on("pageerror", (e) => errors.push(e.message));
      b.on("pageerror", (e) => errors.push(e.message));
      const callsA = await backend(a, f.owner),
        callsB = await backend(b, f.secondDevice);
      await a.goto("/ingressos");
      const original = await decode(
        a,
        f.a.name,
        `/tmp/qr-${browserName}-${width}-original.png`,
      );
      const memberToken = await decode(a, f.b.name);
      const active = (guest: string) =>
        db
          .sql(
            `select id from qr_credentials where guest_id='${guest}' and revoked_at is null;`,
          )
          .trim();
      const oldId = active(f.a.id),
        memberId = active(f.b.id);
      const issuesBefore = callsA.filter((c) => c.fn === "issue_ticket").length;
      await a.reload();
      expect(await decode(a, f.a.name)).toBe(original);
      await a.goto("/informacoes");
      await a.goto("/ingressos");
      expect(await decode(a, f.a.name)).toBe(original);
      expect(callsA.filter((c) => c.fn === "issue_ticket")).toHaveLength(
        issuesBefore,
      );
      await b.goto("/ingressos");
      const card = b.getByText(f.a.name, { exact: true }).locator("..");
      await expect(
        card.getByRole("button", {
          name: "Substituir meu QR Code",
          exact: true,
        }),
      ).toBeVisible();
      await expect(card).toContainText(
        "Seu QR Code já foi emitido em outro dispositivo",
      );
      await expect(
        b.getByLabel(`Convite individual de ${f.a.name}`, { exact: true }),
      ).toHaveCount(0);
      expect(
        callsB.filter((c) => ["issue_ticket", "replace_ticket"].includes(c.fn)),
      ).toHaveLength(0);
      await card
        .getByRole("button", { name: "Substituir meu QR Code", exact: true })
        .click();
      const dialog = b.getByRole("dialog");
      await expect(dialog).toContainText("invalidar o anterior");
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      expect(active(f.a.id)).toBe(oldId);
      await card
        .getByRole("button", { name: "Substituir meu QR Code", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const replacement = await decode(
        b,
        f.a.name,
        `/tmp/qr-${browserName}-${width}-replacement.png`,
      );
      expect(replacement).not.toBe(original);
      expect(active(f.b.id)).toBe(memberId);
      expect(callsB.filter((c) => c.fn === "replace_ticket")).toHaveLength(1);
      expect(
        callsB.find((c) => c.fn === "replace_ticket")!.args
          .p_expected_credential,
      ).toBe(oldId);
      const hash = (token: string) =>
        createHash("sha256").update(token).digest("hex");
      const register = (token: string) =>
        db.rpc(f.staff, "app_mutate", {
          p_event: f.event,
          p_mutation: randomUUID(),
          p_type: "CHECKIN_CREATE",
          p_payload: { method: "QR", token_hash: hash(token) },
        });
      expect(() => register(original)).toThrow(/invalid QR/);
      const entry = register(replacement);
      expect(register(replacement).id).toBe(entry.id);
      expect(register(memberToken).guest_id).toBe(f.b.id);
      await a.reload();
      await expect(
        a.getByLabel(`Convite individual de ${f.a.name}`, { exact: true }),
      ).toHaveCount(0);
      await expect(
        a
          .getByText(f.a.name, { exact: true })
          .locator("..")
          .getByRole("button", { name: "Substituir meu QR Code", exact: true }),
      ).toBeVisible();
      expect(await decode(a, f.b.name)).toBe(memberToken);
      expect(
        await b.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
test("pending guest never receives a QR and another unit stays outside the authorized snapshot", async ({
  browser,
}) => {
  const f = ticketFixture(db);
  db.sql(
    `update rsvps set status='PENDING' where guest_id in ('${f.a.id}','${f.b.id}');`,
  );
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8083",
  });
  try {
    const page = await context.newPage(),
      calls = await backend(page, f.owner);
    await page.goto("/ingressos");
    await expect(
      page.getByText("Confirme a presença para disponibilizar os convites.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(f.individual.name, { exact: true }),
    ).toHaveCount(0);
    expect(
      calls.filter((c) => ["issue_ticket", "replace_ticket"].includes(c.fn)),
    ).toHaveLength(0);
  } finally {
    await context.close();
  }
});
