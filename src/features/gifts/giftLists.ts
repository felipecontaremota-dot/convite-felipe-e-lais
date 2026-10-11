import type { Gift } from "../../types/domain";
import { safeHttps } from "../../utils/security";

// Reuse the existing gift contract without displaying or converting legacy products.
export const EXTERNAL_LIST = "external-gift-list:v1";
export const FIRST_LIST = {
  title: "Lista de Presentes - Havan",
  url: "https://lista.havan.com.br/Convidado/ItensListaPresente/966559?aba=presentes",
};
export function giftLists(gifts: Gift[] = []) {
  return gifts
    .filter((gift) => gift.description === EXTERNAL_LIST)
    .sort((a, b) => a.sort_order - b.sort_order);
}
export function giftListPayload(title: string, url: string, gift?: Gift) {
  const safe = safeHttps(url.trim());
  if (!title.trim() || title.trim().length > 200 || !safe) return null;
  return {
    id: gift?.id,
    version: gift?.version,
    title: title.trim(),
    external_url: safe,
    description: EXTERNAL_LIST,
    image_url: null,
    price_label: "",
    active: true,
    sort_order: gift?.sort_order ?? 0,
    reservation_enabled: false,
  };
}
