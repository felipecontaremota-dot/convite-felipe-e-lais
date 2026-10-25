import { describe, it, expect, vi } from "vitest";
import {
  publicationCaption,
  deliveryLabel,
} from "../src/features/notifications/publication";
import {
  activateWebPush,
  pushSupport,
  vapidBytes,
} from "../src/features/notifications/webPush";
describe("notification presentation", () => {
  it("uses the publication instant and Brasilia time, never the device timezone", () =>
    expect(publicationCaption("2026-11-15T19:00:00Z")).toBe(
      "Noivos, em 15/11/2026 às 16:00",
    ));
  it("never calls accepted mail delivered", () =>
    expect(deliveryLabel("sent")).toBe("Enviada ao provedor"));
  it("explains iOS installation, unsupported browsers and blocked permissions", () => {
    expect(
      pushSupport({
        supported: true,
        ios: true,
        standalone: false,
        permission: "default",
      }),
    ).toContain("Tela de Início");
    expect(
      pushSupport({
        supported: false,
        ios: false,
        standalone: false,
        permission: "default",
      }),
    ).toContain("não oferece");
    expect(
      pushSupport({
        supported: true,
        ios: false,
        standalone: false,
        permission: "denied",
      }),
    ).toContain("bloqueadas");
  });
  it("decodes base64url without adding storage or secrets", () =>
    expect([...vapidBytes("AQID")]).toEqual([1, 2, 3]));
  it("registers a real subscription only after explicit permission; cleans up if the backend rejects it", async () => {
    const unsubscribe = vi.fn(async () => true),
      register = vi.fn(async () => {
        throw Error("denied");
      });
    const subscription = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fixture",
        keys: { p256dh: "public", auth: "auth" },
      }),
      unsubscribe,
    };
    const subscribe = vi.fn(async () => subscription),
      permission = vi.fn(async () => "granted");
    vi.stubGlobal("window", { Notification: {}, PushManager: {} });
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: permission,
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: async () => ({
          active: {
            postMessage: (_data: unknown, ports: MessagePort[]) =>
              ports[0]!.postMessage({ webPush: true }),
          },
          pushManager: { getSubscription: async () => null, subscribe },
        }),
      },
    });
    try {
      await expect(activateWebPush("AQID", register)).rejects.toThrow("denied");
      expect(permission).toHaveBeenCalledOnce();
      expect(subscribe).toHaveBeenCalledOnce();
      expect(register).toHaveBeenCalledOnce();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not subscribe when permission is denied", async () => {
    vi.stubGlobal("window", { Notification: {}, PushManager: {} });
    vi.stubGlobal("Notification", { permission: "denied" });
    vi.stubGlobal("navigator", { serviceWorker: {} });
    try {
      await expect(activateWebPush("AQID", vi.fn())).rejects.toThrow(
        "bloqueada",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
