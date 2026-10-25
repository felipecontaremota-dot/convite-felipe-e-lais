import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
it("service worker shows a legitimate push and ignores unsafe click destinations", async () => {
  const handlers: Record<string, (e: unknown) => void> = {};
  const show = vi.fn(async () => {}),
    open = vi.fn(async () => {});
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    self: {
      addEventListener: (name: string, handler: (e: unknown) => void) =>
        (handlers[name] = handler),
      registration: {
        scope: "https://example.test/wedding/",
        showNotification: show,
      },
      location: { origin: "https://example.test" },
      clients: { matchAll: async () => [], openWindow: open },
    },
  });
  let pending: Promise<unknown> | undefined;
  handlers.push!({
    data: {
      json: () => ({
        title: "Recado",
        body: "Olá 💙",
        url: "https://evil.test",
        tag: "publication",
      }),
    },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  expect(show).toHaveBeenCalledWith(
    "Recado",
    expect.objectContaining({ body: "Olá 💙", tag: "publication" }),
  );
  handlers.notificationclick!({
    notification: { close: vi.fn(), data: { url: "https://evil.test" } },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  expect(open).toHaveBeenCalledExactlyOnceWith(
    "https://example.test/wedding/inicio",
  );
});
