import { openDeviceCalendar } from "../src/features/rsvp/calendarActions.native";
import { expect, it, vi } from "vitest";
import {
  countdownParts,
  WEDDING_START,
} from "../src/features/countdown/domain";
import {
  calendarDescription,
  calendarEvent,
  calendarIcs,
  googleCalendarUrl,
} from "../src/features/rsvp/calendar";
import type { WeddingEvent } from "../src/types/domain";
const platform = vi.hoisted(() => ({ OS: "ios", Version: 17 }));
vi.mock("react-native", () => ({ Platform: platform }));
const create = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ action: "canceled" }),
);
vi.mock("expo-calendar/legacy", () => ({ createEventInCalendarAsync: create }));
const event = {
  id: "event-id",
  title: "Felipe & Laís",
  starts_at: WEDDING_START,
  timezone: "America/Sao_Paulo",
  venue_name: "Villarejo Eventos",
  address: "Rua João, 10; Goiás",
  latitude: null,
  longitude: null,
} satisfies WeddingEvent;
const target = Date.parse(WEDDING_START);
it("splits the real remaining instant into days/hours/minutes/seconds without drift", () => {
  expect(
    countdownParts(
      WEDDING_START,
      target - (64 * 86400 + 3 * 3600 + 15 * 60 + 46) * 1000,
    ),
  ).toEqual({ days: 64, hours: 3, minutes: 15, seconds: 46, arrived: false });
  expect(countdownParts(WEDDING_START, target - 1000).seconds).toBe(1);
  expect(countdownParts(WEDDING_START, target - 10 * 60000)).toMatchObject({
    minutes: 10,
    seconds: 0,
  });
  expect(countdownParts("2026-12-15T19:00:00Z", target - 1000)).toEqual(
    countdownParts(WEDDING_START, target - 1000),
  );
  expect(() => countdownParts("2026-12-15T16:00:00")).toThrow();
  expect(() => countdownParts("invalidZ")).toThrow();
});
it.each([0, 1, 86400000])(
  "clamps the countdown after the wedding (+%sms)",
  (offset) => {
    expect(countdownParts(WEDDING_START, target + offset)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      arrived: true,
    });
  },
);
it("Google Calendar uses the correct UTC instant, event timezone and encoded title/address with the approved next-day end", () => {
  const params = new URL(googleCalendarUrl(event)).searchParams;
  expect(params.get("text")).toBe("Casamento Felipe & Laís");
  expect(params.get("dates")).toBe("20261215T190000Z/20261216T040000Z");
  expect(params.get("ctz")).toBe("America/Sao_Paulo");
  expect(params.get("location")).toBe(
    "Villarejo Eventos — Rua João, 10; Goiás",
  );
  expect(calendarEvent(event).start).toBe("2026-12-15T19:00:00.000Z");
});
it("ICS preserves accented text, escapes fields and contains no invented DTEND/DURATION", () => {
  const ics = calendarIcs(event, new Date("2026-10-11T19:00:00Z"));
  expect(ics).toContain("DTSTART:20261215T190000Z\r\n");
  expect(ics).toContain("SUMMARY:Casamento Felipe & Laís\r\n");
  expect(ics).toContain(
    "LOCATION:Villarejo Eventos — Rua João\\, 10\\; Goiás\r\n",
  );
  expect(ics).not.toMatch(/DTEND|DURATION/);
  expect(ics).toContain("UID:event-id@convite-felipe-e-lais");
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  const long = calendarIcs({
    ...event,
    address: "á".repeat(100) + "\r\nBEGIN:INJECTED",
  });
  expect(
    long
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  ).toBe(true);
  expect(long.replace(/\r\n /g, "")).toContain("\\nBEGIN:INJECTED");
  expect(long).not.toContain("\r\nBEGIN:INJECTED");
});
it("native calendar opens only the system editor with exact dates; cancel is not an RSVP mutation", async () => {
  await expect(openDeviceCalendar(event)).resolves.toEqual({
    action: "canceled",
  });
  expect(create).toHaveBeenCalledExactlyOnceWith({
    title: "Casamento Felipe & Laís",
    startDate: new Date(WEDDING_START),
    endDate: new Date(WEDDING_START),
    timeZone: "America/Sao_Paulo",
    location: "Villarejo Eventos — Rua João, 10; Goiás",
  });
});

it("older native iOS offers an alternative without requesting broad calendar access", async () => {
  create.mockClear();
  platform.Version = 16;
  await expect(openDeviceCalendar(event)).rejects.toThrow("use Google Agenda");
  expect(create).not.toHaveBeenCalled();
  platform.Version = 17;
});

it("Google template preserves paragraphs and never claims unsupported reminder configuration", () => {
  const p = new URL(googleCalendarUrl(event)).searchParams;
  expect(p.get("details")).toBe(calendarDescription);
  expect(calendarDescription).toContain("\n\n");
  expect(calendarDescription).not.toContain("**");
  expect(p.has("reminders")).toBe(false);
  expect(p.has("recur")).toBe(false);
  expect(calendarEvent(event).end).toBe("2026-12-16T04:00:00.000Z");
});
