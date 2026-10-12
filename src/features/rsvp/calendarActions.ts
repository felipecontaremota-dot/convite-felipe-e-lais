import type { WeddingEvent } from "../../types/domain";
import { downloadCalendar } from "./calendar";
export async function openDeviceCalendar(event: WeddingEvent) {
  downloadCalendar(event);
}
