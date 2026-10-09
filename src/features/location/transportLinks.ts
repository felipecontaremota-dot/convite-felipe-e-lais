import type { WeddingEvent } from "../../types/domain";
import { safeHttps } from "../../utils/security";
export function transportLinks(event: WeddingEvent) {
  const { latitude: lat, longitude: lng, address } = event;
  const coordinates =
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const destination = address || (coordinates ? `${lat},${lng}` : null);
  const gps = safeHttps(event.gps_url);
  return {
    gps,
    google: destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
      : null,
    waze:
      coordinates && !address
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : address
          ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
          : null,
    uber: address
      ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(address)}`
      : null,
    share: address || (coordinates ? `${lat}, ${lng}` : null),
  };
}
export async function nativeMapOptions(
  event: WeddingEvent,
  os: "ios" | "android",
  canOpen: (url: string) => Promise<boolean>,
) {
  const links = transportLinks(event),
    destination =
      !event.address &&
      event.latitude !== null &&
      event.longitude !== null &&
      links.google
        ? `${event.latitude},${event.longitude}`
        : event.address;
  const candidates = [
    {
      label: "Google Maps",
      url: destination
        ? os === "ios"
          ? `comgooglemaps://?daddr=${encodeURIComponent(destination)}&directionsmode=driving`
          : `google.navigation:q=${encodeURIComponent(destination)}`
        : null,
    },
    {
      label: "Waze",
      url: links.waze?.replace("https://waze.com/ul", "waze://") || null,
    },
    {
      label: "Uber",
      url: links.uber?.replace("https://m.uber.com/ul/", "uber://") || null,
    },
  ];
  const checked = await Promise.all(
    candidates.map(async (option) => ({
      ...option,
      available: option.url
        ? await canOpen(option.url).catch(() => false)
        : false,
    })),
  );
  return checked.filter(
    (o): o is typeof o & { url: string } => o.available && !!o.url,
  );
}

export function mapsEmbedUrl(event: WeddingEvent, key?: string) {
  const place = [event.venue_name, event.address].filter(Boolean).join(", ");
  return key?.trim() && place
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key.trim())}&q=${encodeURIComponent(place)}`
    : null;
}
