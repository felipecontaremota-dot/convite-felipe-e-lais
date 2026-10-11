import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("controlled cut removes only this app queue, snapshots, tickets, Auth cache and PWA cache", async ({
  page,
}) => {
  await page.route("**/convite-felipe-e-lais/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Maintenance fixture</title>",
    }),
  );
  await page.goto("/convite-felipe-e-lais/");
  await page.evaluate(async () => {
    const event = "00000000-0000-4000-8000-000000000001";
    for (const prefix of ["queue:", "cache:", "tickets:"])
      localStorage.setItem(`${prefix}${event}:old-user`, '["stale"]');
    localStorage.setItem("sb-testproject-auth-token", "fixture");
    localStorage.setItem("other-app", "keep");
    sessionStorage.setItem(`queue:${event}:old-user`, '["stale"]');
    await caches.open("felipe-lais:/convite-felipe-e-lais/:old");
    await caches.open("other-app-cache");
    const responses = ["LIMPAR TESTES", "testproject"];
    window.prompt = () => responses.shift() ?? null;
    window.alert = () => {};
  });
  await page.evaluate(
    readFileSync("scripts/rebuild-pr21/clear-browser-data.js", "utf8"),
  );
  const result = await page.evaluate(async () => ({
    keys: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    caches: await caches.keys(),
  }));
  expect(result.keys).toEqual(["other-app"]);
  expect(result.session).toEqual([]);
  expect(result.caches).toEqual(["other-app-cache"]);
});
