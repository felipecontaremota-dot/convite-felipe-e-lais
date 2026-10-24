import type { WeddingEvent } from "../../types/domain";
import { transportLinks } from "../location/transportLinks";
import { openDeviceLocation } from "../location/locationNavigation";
import type { PartyRole } from "./types";

export function ceremonyCopy(role?: PartyRole | null) {
  const ending = role === "PADRINHO" ? "lo" : role === "MADRINHA" ? "la" : null;
  return {
    guidance:
      "Ao chegar, procure nossa equipe de cerimonial, liderada pelo Gustavo Morais, que estará à disposição para " +
      (ending
        ? `recebê-${ending} e conduzi-${ending}.`
        : "receber você e conduzir você."),
    closing:
      "Acima de tudo, queremos que aproveite cada instante! " +
      (role === "PADRINHO"
        ? "Você foi escolhido porque faz parte da nossa história"
        : role === "MADRINHA"
          ? "Você foi escolhida porque faz parte da nossa história"
          : "Você faz parte da nossa história") +
      ", e ter você pertinho de nós tornará esse momento ainda mais inesquecível! 💙",
  };
}

export function partyMapLink(event: WeddingEvent, apple = false) {
  const links = transportLinks(event);
  if (links.gps) return links.gps;
  // Reuse Local's coordinate validation; prefer an exact point when available.
  const coordinateLink = transportLinks({ ...event, address: null }).google;
  const destination = coordinateLink
    ? `${event.latitude},${event.longitude}`
    : event.address;
  if (!destination) return null;
  return apple
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
    : coordinateLink || links.google;
}

// Native delegates to the OS once; HTTPS remains available without a maps app.
export async function openPartyMap(
  event: WeddingEvent,
  os: string,
  openUrl: (url: string) => Promise<unknown>,
) {
  const url = partyMapLink(event, os === "ios");
  if (!url) return false;
  if (!transportLinks(event).gps) {
    const coordinates = transportLinks({ ...event, address: null }).google;
    const target = coordinates ? { ...event, address: null } : event;
    if ((await openDeviceLocation(target, os, openUrl)) === "opened")
      return true;
  }
  await openUrl(url);
  return true;
}
