import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
for (const width of [390, 1280]) {
  test(`Villarejo asset loads unchanged in a circular cover at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo convidado", exact: true })
      .click();
    await page.getByRole("link", { name: "Local", exact: true }).click();
    const source = page.getByRole("img", {
      name: "Villarejo Eventos",
      exact: true,
    });
    const image = source.locator("..");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        source.evaluate(
          (img: HTMLImageElement) =>
            img.complete &&
            img.naturalWidth === 150 &&
            img.naturalHeight === 150,
        ),
      )
      .toBe(true);
    const response = await page.request.get(
      (await source.getAttribute("src"))!,
    );
    expect(response.ok()).toBe(true);
    expect(digest(await response.body())).toBe(
      digest(readFileSync("assets/villarejo-eventos.jpg")),
    );
    const geometry = await image.evaluate((el) => {
      const rect = el.getBoundingClientRect(),
        card = el.parentElement!.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        radius: css.borderRadius,
        cover: Array.from(el.children).some(
          (child) => getComputedStyle(child).backgroundSize === "cover",
        ),
        withinCard:
          rect.left >= card.left &&
          rect.right <= card.right &&
          rect.top >= card.top &&
          rect.bottom <= card.bottom,
        centered:
          Math.abs(rect.left + rect.width / 2 - (card.left + card.width / 2)) <
          1,
      };
    });
    expect(geometry).toEqual({
      width: 112,
      height: 112,
      radius: "56px",
      cover: true,
      withinCard: true,
      centered: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Abrir localização", exact: true }),
    ).toBeDisabled();
  });
}
