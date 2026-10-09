import { it, expect } from "vitest";
import {
  administrativeError,
  friendlyError,
  AppError,
} from "../src/lib/errors";
import { mapsEmbedUrl } from "../src/features/location/transportLinks";
import type { WeddingEvent } from "../src/types/domain";
it("administrative errors are actionable without exposing SQL", () => {
  expect(friendlyError(new AppError("conflict"))).toBe(
    "Os dados foram alterados em outra sessão. Atualize e tente novamente.",
  );
  expect(friendlyError(new Error("not found"))).toBe(
    "O registro não existe mais. Atualize a página.",
  );
  expect(administrativeError("invalid family")).toBe(
    "A família selecionada não está mais disponível.",
  );
  expect(friendlyError(new Error("SQL DETAIL private payload"))).not.toContain(
    "SQL",
  );
});
it("Maps Embed is opt-in and URL-encodes public key and saved venue without invented data", () => {
  const event = {
    venue_name: "Espaço & Festa",
    address: "Rua São João, 12",
  } as WeddingEvent;
  expect(mapsEmbedUrl(event)).toBeNull();
  expect(mapsEmbedUrl(event, "   ")).toBeNull();
  expect(mapsEmbedUrl({} as WeddingEvent, "fixture-public-key")).toBeNull();
  const url = new URL(mapsEmbedUrl(event, "fixture-public-key")!);
  expect(url.origin).toBe("https://www.google.com");
  expect(url.pathname).toBe("/maps/embed/v1/place");
  expect(url.searchParams.get("key")).toBe("fixture-public-key");
  expect(url.searchParams.get("q")).toBe("Espaço & Festa, Rua São João, 12");
});
