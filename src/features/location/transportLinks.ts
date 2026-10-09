import type { WeddingEvent } from "../../types/domain";
export function transportLinks(event: WeddingEvent) {
  const { latitude: lat, longitude: lng, address } = event;
  const coordinates =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const destination = coordinates ? `${lat},${lng}` : address;
  return {
    google: destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
      : null,
    waze: coordinates
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : null,
    // Uber and 99: use share/copy until a supported integration is configured.
    share: address || (coordinates ? `${lat}, ${lng}` : null),
  };
}
