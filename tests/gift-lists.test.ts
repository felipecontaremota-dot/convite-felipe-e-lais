import { expect, it } from "vitest";
import type { Gift } from "../src/types/domain";
import {
  EXTERNAL_LIST,
  FIRST_LIST,
  giftLists,
  giftListPayload,
} from "../src/features/gifts/giftLists";
it("external list payload reuses the contract without individual product fields", () => {
  expect(giftListPayload(FIRST_LIST.title, FIRST_LIST.url)).toMatchObject({
    title: FIRST_LIST.title,
    external_url: FIRST_LIST.url,
    description: EXTERNAL_LIST,
    image_url: null,
    price_label: "",
    active: true,
    reservation_enabled: false,
  });
  const existing = { id: "list", version: 3, sort_order: 5 } as Gift;
  expect(
    giftListPayload(" Outra loja ", " https://example.test/lista ", existing),
  ).toMatchObject({
    id: "list",
    version: 3,
    title: "Outra loja",
    external_url: "https://example.test/lista",
    sort_order: 5,
  });
});
it.each([
  "abc",
  "teste",
  "havan",
  "javascript:alert(1)",
  "http://example.test/lista",
  "https://user:password@example.test",
  "https://",
])("rejects unsafe or unsupported URL %s", (url) => {
  expect(giftListPayload("Lista", url)).toBeNull();
});
it("requires a title and excludes legacy products without modifying them", () => {
  expect(giftListPayload(" ", FIRST_LIST.url)).toBeNull();
  const old = {
    id: "old",
    title: "Produto",
    description: "Presente individual",
    external_url: FIRST_LIST.url,
  } as Gift;
  const list = { ...old, id: "new", description: EXTERNAL_LIST };
  expect(giftLists([old, list])).toEqual([list]);
  expect(old.description).toBe("Presente individual");
});
