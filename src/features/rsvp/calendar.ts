import type { WeddingEvent } from "../../types/domain";
import { countdownParts } from "../countdown/domain";

export const calendarDescription =
  "💍✨ O grande dia está chegando!\n\nAgora é oficial: temos um encontro marcado para celebrar o nosso amor! ❤️🥂\n\n💙 Prepare o look, capriche na animação e venha viver esse momento tão especial com a gente!\n\nCom carinho, Felipe & Laís! 💍💕";
export const WEDDING_END = "2026-12-16T01:00:00-03:00";
export function calendarEvent(event: WeddingEvent) {
  countdownParts(event.starts_at); // Reject a floating date without an explicit timezone.
  return {
    title: "Casamento Felipe & Laís",
    start: new Date(event.starts_at).toISOString(),
    end: new Date(WEDDING_END).toISOString(),
    location: [event.venue_name || "Villarejo Eventos", event.address]
      .filter(Boolean)
      .join(" — "),
    id: event.id,
  };
}
const stamp = (date: string) =>
  date.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function googleCalendarUrl(event: WeddingEvent) {
  const data = calendarEvent(event);
  const start = stamp(data.start);
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: data.title,
    dates: `${start}/${stamp(data.end)}`,
    details: calendarDescription,
    ctz: "America/Sao_Paulo",
    location: data.location,
  })}`;
}
const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  const encoder = new TextEncoder();
  let result = "",
    bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}
export function calendarIcs(event: WeddingEvent, now = new Date()) {
  const data = calendarEvent(event);
  // RFC 5545 permits DTSTART without DTEND/DURATION: no invented ceremony end.
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Felipe e Lais//Casamento//PT-BR",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${escape(data.id)}@convite-felipe-e-lais`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(data.start)}`,
      `SUMMARY:${escape(data.title)}`,
      `LOCATION:${escape(data.location)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
export function downloadCalendar(event: WeddingEvent) {
  const url = URL.createObjectURL(
    new Blob([calendarIcs(event)], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "casamento-felipe-e-lais.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
