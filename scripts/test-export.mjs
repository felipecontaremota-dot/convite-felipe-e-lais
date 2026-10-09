import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
        args: ["--no-sandbox"],
      }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:8082"
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8082/");
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .count(),
    0,
  );
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    {},
    { timeout: 30000 },
  );
  await page.goto("http://127.0.0.1:8082/c/DemoConviteExclusivoFelipeLais2026");
  await page
    .getByText("Configure o Supabase ou use o modo demo de desenvolvimento.", {
      exact: true,
    })
    .waitFor();
  const privateCached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (
      await Promise.all(
        keys.map(async (key) => (await caches.open(key)).keys()),
      )
    ).flat();
    return requests.some((r) => new URL(r.url).pathname.startsWith("/c/"));
  });
  assert.equal(privateCached, false);
  await page.goto("http://127.0.0.1:8082/");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "/tmp/wedding-public.png", fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .count(),
    0,
  );
  console.log(
    "Export/PWA: shell offline, fallback /c, demo bloqueado em release, ausência de cache de códigos e layout 390×844 verificados.",
  );
} finally {
  await browser.close();
}
