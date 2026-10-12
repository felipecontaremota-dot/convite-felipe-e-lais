import { Platform } from "react-native";
import { AppError } from "../../lib/errors";
import { createEventInCalendarAsync } from "expo-calendar/legacy";
import type { WeddingEvent } from "../../types/domain";
import { calendarEvent } from "./calendar";
export async function openDeviceCalendar(event: WeddingEvent) {
  if (
    Platform.OS === "ios" &&
    Number.parseInt(String(Platform.Version), 10) < 17
  )
    throw new AppError(
      "Neste iPhone, use Google Agenda ou abra o convite no navegador para baixar o arquivo .ics.",
    );
  const data = calendarEvent(event);
  // System editor only: no calendar enumeration, permission request or silent insertion.
  return createEventInCalendarAsync({
    title: data.title,
    startDate: new Date(data.start),
    endDate: new Date(data.start),
    timeZone: event.timezone,
    location: data.location,
  });
}
