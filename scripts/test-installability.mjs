import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createExportServer } from "./serve-web.mjs";
import { getExportWebBasePath, webPath } from "../config/web-paths.cjs";

// A full Chromium, non-incognito profile is essential. A synthetic Event or
// the default Playwright incognito context cannot prove native installability.
export async function verifyNativeInstallCapture(origin, basePath) {
  const context = await chromium.launchPersistentContext("", {
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          args: ["--no-sandbox"],
        }
      : { channel: "chromium" }),
  });
  try {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const response = await page.goto(origin + webPath("", basePath));
    assert.equal(response.status(), 200);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    const manifest = await cdp.send("Page.getAppManifest");
    assert.equal(
      manifest.url,
      origin + webPath("manifest.webmanifest", basePath),
    );
    assert.deepEqual(manifest.errors, [], "Chromium rejected the manifest");
    const { installabilityErrors } = await cdp.send(
      "Page.getInstallabilityErrors",
    );
    assert.deepEqual(
      installabilityErrors,
      [],
      "Real Chromium reports installability errors",
    );
    // A harmless gesture allows browsers with engagement policies to evaluate.
    await page.mouse.click(10, 10);
    await page.waitForFunction(
      () => {
        const snapshot = window.__weddingPwaInstall?.getSnapshot();
        return (
          snapshot?.capturedAt !== null &&
          snapshot?.eventTrusted === true &&
          snapshot?.reactAttachedAt !== null
        );
      },
      {},
      { timeout: 45000 },
    );
    const snapshot = await page.evaluate(() =>
      window.__weddingPwaInstall.getSnapshot(),
    );
    assert.equal(snapshot.defaultPrevented, true);
    assert.equal(
      snapshot.eventTrusted,
      true,
      "The event must be native, not dispatched by a test",
    );
    assert.ok(
      snapshot.registeredAt < snapshot.capturedAt,
      "HTML capture was registered too late",
    );
    assert.equal(
      snapshot.promptAvailable,
      true,
      "React initialization must not consume the native event",
    );
    assert.equal(snapshot.consumed, 0);
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      {},
      { timeout: 30000 },
    );
    const controller = await page.evaluate(
      () => navigator.serviceWorker.controller.scriptURL,
    );
    assert.equal(controller, origin + webPath("sw.js", basePath));
    console.log(
      "Native PWA capture:",
      JSON.stringify({
        registeredAt: snapshot.registeredAt,
        beforeinstallpromptAt: snapshot.capturedAt,
        reactAttachedAt: snapshot.reactAttachedAt,
        capturePhase: snapshot.capturePhase,
        defaultPrevented: snapshot.defaultPrevented,
        eventTrusted: snapshot.eventTrusted,
        installabilityErrors,
        controller: new URL(controller).pathname,
      }),
    );
    return snapshot;
  } finally {
    await context.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createExportServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await verifyNativeInstallCapture(
      `http://127.0.0.1:${server.address().port}`,
      getExportWebBasePath(),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
