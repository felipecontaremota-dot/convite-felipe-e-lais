import { describe, it, expect, vi } from "vitest";
import { runInNewContext } from "node:vm";
import {
  installBootstrap,
  installBootstrapScript,
  type InstallPrompt,
} from "../src/features/install/installBootstrap";
function fixture(standalone = false, supported = true) {
  const media = Object.assign(new EventTarget(), { matches: standalone });
  let clock = 0;
  const target = Object.assign(new EventTarget(), {
    navigator: { userAgent: "Chrome", platform: "Linux", maxTouchPoints: 0 },
    performance: { now: () => ++clock },
    matchMedia: () => media,
    ...(supported ? { onbeforeinstallprompt: null } : {}),
  }) as unknown as Window;
  return { target, media };
}
function offer(target: Window) {
  const prompt = vi.fn(async () => {});
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    },
  ) as InstallPrompt;
  target.dispatchEvent(event);
  return { event, prompt };
}
describe("document-scoped early PWA capture", () => {
  it("serialized HTML bootstrap captures before React and keeps availability reads non-consuming", () => {
    const { target } = fixture();
    runInNewContext(installBootstrapScript(), { window: target });
    const { event, prompt } = offer(target);
    const store = installBootstrap(target);
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(store.getSnapshot().capturePhase).toBe("early");
    expect(store.getSnapshot().promptAvailable).toBe(true);
    expect(store.getSnapshot().promptAvailable).toBe(true);
    store.subscribe(() => {});
    expect(store.getSnapshot().capturedAt).toBeLessThan(
      store.getSnapshot().reactAttachedAt!,
    );
    expect(store.consume()).toBe(event);
    expect(store.consume()).toBe(null);
    expect(store.getSnapshot().consumed).toBe(1);
  });
  it("captures after React without duplicate browser listeners", () => {
    const { target } = fixture();
    const add = vi.spyOn(target, "addEventListener");
    const store = installBootstrap(target);
    expect(installBootstrap(target)).toBe(store);
    expect(
      add.mock.calls.filter(([type]) => type === "beforeinstallprompt"),
    ).toHaveLength(1);
    store.subscribe(() => {});
    const { event } = offer(target);
    expect(store.getSnapshot().capturePhase).toBe("react");
    expect(store.consume()).toBe(event);
  });
  it("preserves the reference through subscriber unmount/remount", () => {
    const { target } = fixture();
    const store = installBootstrap(target);
    const cleanup = store.subscribe(() => {});
    const { event } = offer(target);
    cleanup();
    store.subscribe(() => {});
    expect(store.consume()).toBe(event);
  });
  it.each(["accepted", "dismissed", "error"] as const)(
    "records %s and prevents reusing a consumed event",
    (outcome) => {
      const { target } = fixture();
      const store = installBootstrap(target);
      const { event } = offer(target);
      store.consume();
      store.complete(outcome);
      expect(store.getSnapshot().status).toBe(outcome);
      target.dispatchEvent(event);
      expect(store.consume()).toBe(null);
      store.fallback();
      expect(store.getSnapshot().fallbackReason).toBe(outcome);
    },
  );
  it("keeps a new browser event arriving while the first choice is pending", () => {
    const { target } = fixture();
    const store = installBootstrap(target);
    offer(target);
    store.consume();
    const second = offer(target);
    expect(store.consume()).toBe(null);
    store.complete("dismissed");
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.consume()).toBe(second.event);
  });
  it("appinstalled before React clears the event and survives late prompt completion", () => {
    const { target } = fixture();
    const store = installBootstrap(target);
    offer(target);
    store.consume();
    target.dispatchEvent(new Event("appinstalled"));
    store.subscribe(() => {});
    store.complete("accepted");
    expect(store.getSnapshot().status).toBe("installed");
    expect(store.consume()).toBe(null);
  });
  it("standalone does not capture another install offer", () => {
    const { target } = fixture(true);
    const store = installBootstrap(target);
    offer(target);
    expect(store.getSnapshot().installed).toBe(true);
    expect(store.consume()).toBe(null);
  });
  it("handles a display-mode transition without losing installed state", () => {
    const { target, media } = fixture();
    const store = installBootstrap(target);
    offer(target);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(store.getSnapshot().status).toBe("installed");
  });
  it("distinguishes unsupported from pending without fabricating a prompt", () => {
    const noAPI = fixture(false, false);
    const store = installBootstrap(noAPI.target);
    store.fallback();
    expect(store.getSnapshot().status).toBe("unsupported");
    expect(store.getSnapshot().fallbackReason).toBe("unsupported");
    expect(installBootstrap(fixture().target).getSnapshot().status).toBe(
      "pending",
    );
  });
  it("a new document starts without the old event", () => {
    const one = fixture();
    offerAfterBootstrap(one.target);
    const two = installBootstrap(fixture().target);
    expect(two.getSnapshot().promptAvailable).toBe(false);
    expect(two.consume()).toBe(null);
  });
});
function offerAfterBootstrap(target: Window) {
  installBootstrap(target);
  offer(target);
}
