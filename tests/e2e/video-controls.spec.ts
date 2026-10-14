import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.route("**/pedido-casamento-web.mp4", () => {});
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      get: () => 4,
    });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
}
for (const width of [320, 375, 390, 768, 1280]) {
  test(`glass controls stay within the video with accessible touch areas at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    await page.goto("/");
    const close = page.getByRole("button", {
      name: "Fechar vídeo",
      exact: true,
    });
    const sound = page.getByRole("button", { name: "Ativar som", exact: true });
    await expect(close).toBeVisible();
    await expect(page.locator(".proposal-space")).toHaveAttribute(
      "data-phase",
      "open",
    );
    await page.waitForTimeout(900);
    await expect(close).toHaveText("");
    await expect(close.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    await expect(sound).toHaveText("Ativar som");
    await expect(sound.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    const stage = (await page.locator(".proposal-stage").boundingBox())!;
    const boxes = [(await sound.boundingBox())!, (await close.boundingBox())!];
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(stage.x);
      expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
      expect(box.y).toBeGreaterThan(stage.y + stage.height / 2);
      expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
    }
    expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(close).toHaveCSS("border-radius", "999px");
    await expect(sound).toHaveCSS("backdrop-filter", "blur(12px)");
    await close.focus();
    await expect(close).toBeFocused();
    await expect(close).toHaveCSS("outline-style", "solid");
    await page.addStyleTag({
      content:
        ".proposal-stage { background: linear-gradient(110deg, #ffffff, #d9e4ed 45%, #18324f 65%, #000000) !important; }",
    });
    await page.screenshot({ path: info.outputPath(`controls-${width}.png`) });
    await page.locator("video").evaluate((video: HTMLVideoElement) => {
      video.currentTime = 18;
    });
    await sound.focus();
    await sound.press("Enter");
    await expect(
      page.getByRole("button", { name: "Silenciar", exact: true }),
    ).toBeVisible();
    expect(
      await page.locator("video").evaluate((v: HTMLVideoElement) => ({
        muted: v.muted,
        time: v.currentTime,
      })),
    ).toEqual({ muted: false, time: 18 });
    await page
      .getByRole("button", { name: "Silenciar", exact: true })
      .press("Enter");
    expect(
      await page.locator("video").evaluate((v: HTMLVideoElement) => v.muted),
    ).toBe(true);
    await close.focus();
    await close.press("Enter");
    await expect(
      page.getByRole("button", { name: "Rever nosso vídeo", exact: true }),
    ).toBeFocused();
  });
}
test("shared controls are identical on exclusive access and the internal manual player", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/c/DemoConviteExclusivoFelipeLais2026");
  const close = page.getByRole("button", { name: "Fechar vídeo", exact: true });
  await expect(close).toBeVisible();
  await expect(close).toHaveText("");
  await expect(
    page
      .getByRole("button", { name: "Ativar som", exact: true })
      .locator("svg"),
  ).toHaveCount(1);
  await close.click();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await page
    .getByRole("button", { name: "Assistir ao nosso vídeo", exact: true })
    .click();
  await expect(close).toBeVisible();
  await expect(close).toHaveText("");
  await expect(close).toHaveCSS("border-radius", "999px");
});
test("control motion respects reduced motion and glass has a contrasting fallback", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const close = page.getByRole("button", { name: "Fechar vídeo", exact: true });
  await expect(close).toBeVisible();
  await close.hover();
  await expect(close).toHaveCSS("transition-duration", "0s");
  await expect(close).toHaveCSS("transform", "none");
  await page.addStyleTag({
    content:
      ".proposal-controls button { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }",
  });
  const sound = page.getByRole("button", { name: "Ativar som", exact: true });
  await expect(sound).toHaveCSS("background-color", "rgba(24, 50, 79, 0.85)");
  await expect(sound).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("hover and press keep gentle feedback on both controls", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  const sound = page.getByRole("button", { name: "Ativar som", exact: true });
  const close = page.getByRole("button", { name: "Fechar vídeo", exact: true });
  await expect(close).toBeVisible();
  await page.waitForTimeout(900);
  for (const button of [sound, close]) {
    await button.hover();
    await page.waitForTimeout(240);
    await expect(button).toHaveCSS("transition-duration", "0.2s, 0.2s, 0.2s");
    await page.mouse.down();
    await page.waitForTimeout(240);
    expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "matrix(0.97, 0, 0, 0.97, 0, 0)",
    );
    await page.mouse.up();
  }
});
