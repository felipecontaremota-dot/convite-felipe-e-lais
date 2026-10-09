import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { once } from "node:events";
import { chromium } from "playwright";
import { getExportWebBasePath, webPath } from "../config/web-paths.cjs";
import { createExportServer } from "./serve-web.mjs";

const basePath = getExportWebBasePath();
const shell = webPath("", basePath);
const html = await readFile("dist/index.html", "utf8");
assert.equal(
  await readFile("dist/404.html", "utf8"),
  html,
  "404 must use the identical shell",
);
await access("dist/.nojekyll");
const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
assert.equal(manifest.start_url, shell);
assert.equal(manifest.scope, shell);
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (match) => match[1],
);
assert.ok(scripts.length > 0, "Export must contain bundled JS");
const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(
  (match) => match[1],
);
for (const url of urls)
  assert.ok(url.startsWith(shell), `Unscoped HTML asset: ${url}`);
for (const icon of manifest.icons)
  assert.ok(icon.src.startsWith(shell), `Unscoped icon: ${icon.src}`);

const server = createExportServer({ basePath });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const unrelatedCache = "another-pages-application-cache";
  // Seed another application's cache before our worker activates.
  await page.goto(origin + webPath("manifest.webmanifest", basePath));
  await page.evaluate(async (name) => {
    await (
      await caches.open(name)
    ).put("/other-application/marker", new Response("preserve"));
  }, unrelatedCache);
  const requests = [],
    errors = [],
    assetFailures = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.request().resourceType() === "script" &&
      response.status() !== 200
    )
      assetFailures.push(response.url());
  });
  const home = await page.goto(origin + shell);
  assert.equal(home.status(), 200);
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /^Demo / }).count(), 0);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    {},
    { timeout: 30000 },
  );
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { scope: registration.scope, worker: registration.active.scriptURL };
  });
  assert.deepEqual(registration, {
    scope: origin + shell,
    worker: origin + webPath("sw.js", basePath),
  });

  for (const path of [
    webPath("manifest.webmanifest", basePath),
    webPath("sw.js", basePath),
    webPath("icon.svg", basePath),
    ...manifest.icons.map((icon) => icon.src),
    ...scripts,
  ]) {
    const response = await context.request.get(origin + path);
    assert.equal(response.status(), 200, `Asset missing: ${path}`);
    assert.ok((await response.body()).length > 0);
  }
  const fallback = await context.request.get(
    origin + webPath("c/CodigoTeste", basePath),
  );
  assert.equal(
    fallback.status(),
    404,
    "Test must exercise the actual Pages 404 fallback",
  );
  assert.equal(await fallback.text(), html);
  if (basePath)
    assert.equal(
      (await context.request.get(origin + "/_expo/missing.js")).status(),
      404,
    );

  const invite = origin + webPath("c/CodigoTeste", basePath);
  assert.equal((await page.goto(invite)).status(), 404);
  await page.getByText("Seu convite", { exact: true }).waitFor();
  assert.equal(
    page.url(),
    invite,
    "Router must retain the original invitation path/code",
  );
  // The long code exercises the unconfigured backend message and production demo guard.
  await page.goto(
    origin + webPath("c/DemoConviteExclusivoFelipeLais2026", basePath),
  );
  await page
    .getByText(
      "O convite ainda não está disponível. Tente novamente mais tarde.",
      { exact: true },
    )
    .waitFor();

  assert.equal(
    await page.evaluate(
      async (name) =>
        (
          await (await caches.open(name)).match("/other-application/marker")
        )?.text(),
      unrelatedCache,
    ),
    "preserve",
  );
  const cachedPaths = await page.evaluate(async (prefix) => {
    const keys = (await caches.keys()).filter((key) => key.startsWith(prefix));
    return (
      await Promise.all(
        keys.map(async (key) => (await caches.open(key)).keys()),
      )
    )
      .flat()
      .map((request) => new URL(request.url).pathname);
  }, `felipe-lais:${shell}:`);
  assert.ok(cachedPaths.includes(shell));
  assert.ok(
    cachedPaths.some((path) => path.startsWith(webPath("_expo/", basePath))),
  );
  assert.ok(cachedPaths.every((path) => path.startsWith(shell)));
  assert.ok(
    cachedPaths.every((path) => !path.startsWith(webPath("c/", basePath))),
    "Private URLs must not be cached",
  );
  assert.ok(
    requests
      .filter((url) => url.origin === origin)
      .every((url) => url.pathname.startsWith(shell)),
    "Unexpected request outside the base path",
  );
  assert.deepEqual(assetFailures, []);
  assert.deepEqual(errors, []);
  await page.goto(origin + shell);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /^Demo / }).count(), 0);
  // Offline navigation to an invitation also uses shell, without storing its URL.
  await page.goto(invite);
  await page.getByText("Seu convite", { exact: true }).waitFor();
  assert.equal(page.url(), invite);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      async (privatePath) => {
        const keys = await caches.keys();
        return (
          await Promise.all(
            keys.map(async (key) => (await caches.open(key)).keys()),
          )
        )
          .flat()
          .some((request) =>
            new URL(request.url).pathname.startsWith(privatePath),
          );
      },
      webPath("c/", basePath),
    ),
    false,
  );
  console.log(
    `Export ${shell}: home/JS/manifest/SW/icons, 404 + invitation path, private-cache isolation, offline shell and 390×844 passed.`,
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
