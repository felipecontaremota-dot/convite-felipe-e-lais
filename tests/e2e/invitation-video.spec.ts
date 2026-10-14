import { test, expect, type Page } from "@playwright/test";
const code = "DemoConviteExclusivoFelipeLais2026";
const videoUrl =
  "https://nwgyxmwaqckpghznbfzm.supabase.co/storage/v1/object/public/convites-assets/pedido-casamento-web.mp4";
async function media(page: Page, rejected = false) {
  await page.route(videoUrl, () => {});
  await page.addInitScript(
    ({ rejected }) => {
      Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
        get: () => 4,
      });
      HTMLMediaElement.prototype.play = function () {
        this.setAttribute(
          "data-play-calls",
          String(Number(this.getAttribute("data-play-calls") || 0) + 1),
        );
        return rejected
          ? Promise.reject(
              new DOMException("Autoplay blocked", "NotAllowedError"),
            )
          : Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        this.setAttribute("data-paused", "true");
      };
    },
    { rejected },
  );
}
async function access(page: Page) {
  await page.goto(`/c/${code}`);
  await expect(
    page.getByText("Olá, Família Demo!", { exact: true }),
  ).toBeVisible();
}
test("exclusive access shares the 1s intro, 850ms expansion and header origin while keeping typing", async ({
  page,
}) => {
  await media(page);
  const time = new Date("2026-10-14T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 100));
  await access(page);
  const space = page.locator(".proposal-space");
  const video = page.locator("video");
  const stage = page.locator(".proposal-stage");
  const icon = page.getByRole("button", {
    name: "Assistir ao nosso vídeo",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Seu convite", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Um novo capítulo, juntos.", { exact: true }),
  ).toHaveCount(0);
  await expect(icon).toBeVisible();
  await expect(space).toHaveAttribute("data-origin", "header");
  await expect(space).toHaveAttribute("data-phase", "waiting");
  expect((await space.boundingBox())!.height).toBe(0);
  await expect(video).not.toHaveAttribute("src");
  const title = page.getByRole("heading", { name: "Seu convite", exact: true });
  const initial = (await title.boundingBox())!.y;
  const input = page.getByLabel("Senha de acesso", { exact: true });
  const countdown = page.getByTestId("wedding-countdown");
  await expect(countdown).toBeVisible();
  expect((await countdown.boundingBox())!.y).toBeLessThan(
    (await input.boundingBox())!.y,
  );
  await expect(
    page.getByLabel("Nome do convidado", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir convite", exact: true }),
  ).toBeVisible();
  await input.fill("00");
  await input.focus();
  await page.clock.runFor(999);
  await expect(space).toHaveAttribute("data-phase", "waiting");
  await page.clock.runFor(1);
  await expect(space).toHaveAttribute("data-phase", "open");
  await expect(input).toBeFocused();
  await page.keyboard.type("47");
  await expect(input).toHaveValue("0047");
  await expect(video).toHaveAttribute("src", videoUrl);
  expect(
    await space.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0.85s, 0.85s");
  expect(
    await stage.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0.85s, 0.85s");
  const iconBox = await icon.boundingBox();
  const spaceBox = await space.boundingBox();
  const origin = await stage.evaluate((el) =>
    parseFloat(getComputedStyle(el).transformOrigin),
  );
  expect(origin).toBeCloseTo(iconBox!.x + iconBox!.width / 2 - spaceBox!.x, 0);
  const originY = await stage.evaluate((el) =>
    parseFloat(getComputedStyle(el).transformOrigin.split(" ")[1]!),
  );
  expect(originY).toBeCloseTo(
    iconBox!.y + iconBox!.height / 2 - spaceBox!.y,
    0,
  );
  await page.waitForTimeout(350);
  const middle = (await title.boundingBox())!.y;
  await page.waitForTimeout(550);
  const end = (await title.boundingBox())!.y;
  expect(middle).toBeGreaterThan(initial);
  expect(end).toBeGreaterThanOrEqual(middle);
  expect(
    await video.evaluate((el: HTMLVideoElement) => ({
      muted: el.muted,
      inline: el.playsInline,
      autoplay: el.autoplay,
    })),
  ).toEqual({ muted: true, inline: true, autoplay: true });
  await video.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 18;
  });
  await page.getByRole("button", { name: "Ativar som", exact: true }).click();
  expect(
    await video.evaluate((el: HTMLVideoElement) => el.currentTime),
  ).toBeCloseTo(18, 0);
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);
  await video.dispatchEvent("ended");
  await page.clock.runFor(500);
  await expect(space).toHaveAttribute("data-phase", "closing");
  await page.clock.runFor(850);
  await expect(space).toHaveAttribute("data-phase", "closed");
  await page.waitForTimeout(900);
  expect((await title.boundingBox())!.y).toBeCloseTo(initial, 0);
  await expect(input).toHaveValue("0047");
  await icon.focus();
  await icon.press("Enter");
  await expect(space).toHaveAttribute("data-phase", "open");
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(
    0,
  );
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
});
test("same session suppresses another intro but keeps header replay and Voltar", async ({
  page,
}) => {
  await media(page);
  await access(page);
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  await expect(
    page.getByRole("button", { name: "Assistir ao nosso vídeo", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  await page.waitForTimeout(1200);
  await expect(page.locator("video")).not.toHaveAttribute("src");
  await page
    .getByRole("button", { name: "Assistir ao nosso vídeo", exact: true })
    .click();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
});
test("legacy PIN access stays available while playing and releases the old player", async ({
  page,
}) => {
  await media(page);
  await access(page);
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  const old = await page.locator("video").elementHandle();
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  expect(
    await old!.evaluate((el) => ({
      paused: el.getAttribute("data-paused"),
      src: el.getAttribute("src"),
    })),
  ).toEqual({ paused: "true", src: null });
  await expect(page.locator("video")).not.toHaveAttribute("src");
});
for (const width of [320, 390, 768, 1280])
  test(`exclusive intro keeps its real layout and PIN at ${width}px`, async ({
    page,
  }) => {
    await media(page);
    await page.setViewportSize({ width, height: 844 });
    await access(page);
    const title = page.getByRole("heading", {
      name: "Seu convite",
      exact: true,
    });
    const y = (await title.boundingBox())!.y;
    await page.getByLabel("Senha de acesso", { exact: true }).fill("9999");
    await expect(page.locator(".proposal-space")).toHaveAttribute(
      "data-phase",
      "open",
    );
    await page.waitForTimeout(900);
    const video = await page.locator("video").boundingBox();
    expect(video!.width / video!.height).toBeCloseTo(16 / 9, 1);
    expect(video!.x).toBeGreaterThanOrEqual(0);
    expect(video!.x + video!.width).toBeLessThanOrEqual(width);
    expect((await title.boundingBox())!.y).toBeGreaterThan(y);
    expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(
      video!.y + video!.height,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByLabel("Senha de acesso", { exact: true }),
    ).toHaveValue("9999");
    await page
      .getByRole("button", { name: "Abrir convite", exact: true })
      .click();
    await expect(
      page.getByText("Senha inválida.", { exact: true }),
    ).toBeVisible();
  });
test("reduced motion retains intro and form; autoplay failure still leaves usable access", async ({
  page,
}) => {
  await media(page, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await access(page);
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  expect(
    await page
      .locator(".proposal-space")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  expect(
    await page
      .locator(".proposal-stage")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await expect(
    page.getByRole("button", { name: "Assistir ao nosso vídeo", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
});
