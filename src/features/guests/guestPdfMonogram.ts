import { Asset } from "expo-asset";
import { guestPdfAssetUrl } from "./guestPdfAssetUrl";

// Metro resolves the existing original PNG for both the custom domain and Pages
// subpaths. Read its original bytes; no canvas, recoloring, duplicate or remote URL.
export async function loadGuestPdfMonogram(): Promise<Uint8Array> {
  const asset = Asset.fromModule(
    require("../../../assets/branding/Monograma Dourado F & L.png"),
  );
  const url = guestPdfAssetUrl(asset.uri, window.location.href);
  const response = await fetch(url.href);
  if (!response.ok) throw Error("Não foi possível carregar o monograma.");
  return new Uint8Array(await response.arrayBuffer());
}
