import type { WeddingEvent } from "../../types/domain";
import { transportLinks } from "./transportLinks";

function destination(event: WeddingEvent) {
  const links = transportLinks(event);
  return (
    event.address ||
    (links.google ? `${event.latitude},${event.longitude}` : null)
  );
}

export function locationChoices(event: WeddingEvent) {
  const links = transportLinks(event);
  return [
    { label: "Google Maps", url: links.google },
    { label: "Waze", url: links.waze },
    { label: "Uber", url: links.uber },
  ].filter((choice): choice is { label: string; url: string } => !!choice.url);
}

// Web has no universal maps chooser. Native delegates once, without app detection.
export async function openDeviceLocation(
  event: WeddingEvent,
  os: string,
  openUrl: (url: string) => Promise<unknown>,
): Promise<"opened" | "choose"> {
  const target = destination(event);
  if (!target || (os !== "android" && os !== "ios")) return "choose";
  const url =
    os === "android"
      ? `geo:0,0?q=${encodeURIComponent(target)}`
      : `https://maps.apple.com/?daddr=${encodeURIComponent(target)}`;
  try {
    await openUrl(url);
    return "opened";
  } catch {
    return "choose";
  }
}
