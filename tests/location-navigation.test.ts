import { describe, expect, it, vi } from "vitest";
import {
  locationChoices,
  openDeviceLocation,
} from "../src/features/location/locationNavigation";
import type { WeddingEvent } from "../src/types/domain";
const event: WeddingEvent = {
  id: "event",
  title: "Felipe & Laís",
  starts_at: "2026-12-15T19:00:00Z",
  timezone: "America/Sao_Paulo",
  venue_name: "Villarejo Eventos",
  address: "Rua São João, 12",
  gps_url: "https://maps.test/local",
  latitude: -23,
  longitude: -46,
};
describe("guest location navigation", () => {
  it("keeps configured GPS and the same encoded address across three explicit maps", () => {
    const before = JSON.stringify(event);
    const choices = locationChoices(event);
    expect(choices.map((c) => c.label)).toEqual([
      "Abrir link de localização configurado",
      "Abrir no Google Maps",
      "Abrir no Waze",
      "Abrir no Apple Maps",
    ]);
    expect(choices[0]!.url).toBe(event.gps_url);
    for (const choice of choices.slice(1))
      expect(decodeURIComponent(choice.url)).toContain(event.address);
    expect(choices.every((c) => c.url.startsWith("https://"))).toBe(true);
    expect(JSON.stringify(event)).toBe(before);
  });
  it("retains coordinates as fallback when no address is configured", () => {
    const choices = locationChoices({ ...event, address: null });
    for (const choice of choices.slice(1))
      expect(decodeURIComponent(choice.url)).toContain("-23,-46");
  });
  it.each([
    "javascript:alert(1)",
    "http://unsafe.test",
    "https://user:password@example.test",
  ])("rejects unsafe configured link %s", (gps_url) => {
    expect(
      locationChoices({ ...event, gps_url }).some((c) =>
        c.label.includes("configurado"),
      ),
    ).toBe(false);
  });
  it("has no fabricated destinations when location is not configured", () => {
    expect(
      locationChoices({
        ...event,
        address: null,
        gps_url: null,
        latitude: null,
        longitude: null,
      }),
    ).toEqual([]);
    expect(
      locationChoices({
        ...event,
        address: null,
        gps_url: null,
        latitude: 91,
        longitude: 181,
      }),
    ).toEqual([]);
  });
  it("offers a GPS-only link without guessing its address", async () => {
    const gpsOnly = {
      ...event,
      address: null,
      latitude: null,
      longitude: null,
    };
    expect(locationChoices(gpsOnly)).toEqual([
      { label: "Abrir link de localização configurado", url: event.gps_url },
    ]);
    const open = vi.fn();
    expect(await openDeviceLocation(gpsOnly, "android", open)).toBe("choose");
    expect(open).not.toHaveBeenCalled();
  });
  it.each(["web", "windows"])(
    "%s offers explicit choices without probing installed apps",
    async (os) => {
      const open = vi.fn();
      expect(await openDeviceLocation(event, os, open)).toBe("choose");
      expect(open).not.toHaveBeenCalled();
    },
  );
  it.each(["android", "ios"])(
    "delegates a single documented link on %s",
    async (os) => {
      const open = vi.fn(async () => undefined);
      expect(await openDeviceLocation(event, os, open)).toBe("opened");
      expect(open).toHaveBeenCalledExactlyOnceWith(
        os === "android"
          ? "geo:0,0?q=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012"
          : "https://maps.apple.com/?daddr=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2012",
      );
    },
  );
  it.each(["android", "ios"])(
    "native failure on %s exposes safe choices without silently trying more apps",
    async (os) => {
      const open = vi.fn(async () => {
        throw Error("no handler");
      });
      expect(await openDeviceLocation(event, os, open)).toBe("choose");
      expect(open).toHaveBeenCalledTimes(1);
    },
  );
});
