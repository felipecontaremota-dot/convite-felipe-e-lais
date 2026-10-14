import { test, expect, type Page } from "@playwright/test";
const videoUrl =
  "https://nwgyxmwaqckpghznbfzm.supabase.co/storage/v1/object/public/convites-assets/pedido-casamento-web.mp4";
async function setup(page: Page, rejected = false) {
  // Avoid downloading the 44 MB film in CI. Model playback and dispatch media events.
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
    },
    { rejected },
  );
}
async function opened(page: Page) {
  await page.goto("/");
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await expect(
    page.getByRole("button", { name: "Fechar vídeo", exact: true }),
  ).toBeVisible();
}

test("home original, espera de 1s, expansão física de 850ms e som sem reinício", async ({
  page,
}) => {
  await setup(page);
  const clockTime = new Date("2026-10-13T12:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 100));
  await page.goto("/");
  const space = page.locator(".proposal-space");
  await expect(space).toHaveAttribute("data-phase", "waiting");
  await expect(
    page.getByRole("button", { name: "Assistir ao nosso vídeo", exact: true }),
  ).toHaveCount(0);
  const initial = await space.boundingBox();
  expect(initial!.height).toBe(0);
  const video = page.locator("video");
  await expect(video).not.toHaveAttribute("src");
  const input = page.getByLabel("Nome do convidado", { exact: true });
  await expect(input).toBeVisible();
  await page.clock.runFor(999);
  await expect(space).toHaveAttribute("data-phase", "waiting");
  await page.clock.runFor(1);
  await expect(space).toHaveAttribute("data-phase", "open");
  await expect(video).toHaveAttribute("src", videoUrl);
  await page.clock.runFor(850);
  expect(
    await video.evaluate((v) => ({
      muted: (v as HTMLVideoElement).muted,
      inline: (v as HTMLVideoElement).playsInline,
      controls: (v as HTMLVideoElement).controls,
    })),
  ).toEqual({ muted: true, inline: true, controls: false });
  expect(
    await space.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0.85s, 0.85s");
  await video.evaluate((v) => {
    (v as HTMLVideoElement).currentTime = 18;
  });
  await page.getByRole("button", { name: "Ativar som", exact: true }).click();
  expect(
    await video.evaluate((v) => (v as HTMLVideoElement).currentTime),
  ).toBeCloseTo(18, 0);
  expect(await video.evaluate((v) => (v as HTMLVideoElement).muted)).toBe(
    false,
  );
  await page.getByRole("button", { name: "Silenciar", exact: true }).click();
  expect(await video.evaluate((v) => (v as HTMLVideoElement).muted)).toBe(true);
});

test("fechar, foco, replay a partir de zero e muted, sem repetição após refresh", async ({
  page,
}) => {
  await setup(page);
  await opened(page);
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closing",
  );
  const replay = page.getByRole("button", {
    name: "Rever nosso vídeo",
    exact: true,
  });
  await expect(replay).toBeVisible();
  await expect(replay).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Assistir ao nosso vídeo", exact: true }),
  ).toHaveCount(0);
  await expect(replay).toBeFocused();
  await replay.press("Enter");
  const video = page.locator("video");
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  expect(
    await video.evaluate((v) => ({
      time: (v as HTMLVideoElement).currentTime,
      muted: (v as HTMLVideoElement).muted,
    })),
  ).toEqual({ time: 0, muted: true });
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  await expect(replay).toBeVisible();
  await page.reload();
  await expect(replay).toBeVisible();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  await page
    .getByLabel("Nome do convidado", { exact: true })
    .fill("Convidado Um");
  await page.getByLabel("Senha do convite", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
});

test("ended recolhe após 500ms e erro de mídia não afeta formulário", async ({
  page,
}) => {
  await setup(page);
  await opened(page);
  await page.locator("video").dispatchEvent("ended");
  await expect(
    page.getByRole("button", { name: "Rever nosso vídeo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rever nosso vídeo", exact: true })
    .click();
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await page.locator("video").dispatchEvent("error");
  await expect(
    page.getByRole("button", { name: "Rever nosso vídeo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nome do convidado", { exact: true }),
  ).toBeEditable();
});

test("autoplay rejeitado recolhe sem erro não tratado", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rever nosso vídeo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Senha do convite", { exact: true }),
  ).toBeEditable();
  expect(errors).toEqual([]);
});

for (const width of [320, 1280]) {
  test(`layout 16:9, deslocamento e recolhimento sem overflow em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/");
    const field = page.getByLabel("Nome do convidado", { exact: true });
    const before = (await field.boundingBox())!.y;
    await expect(page.locator(".proposal-space")).toHaveAttribute(
      "data-phase",
      "open",
    );
    await expect
      .poll(
        async () =>
          (await page.locator(".proposal-space").boundingBox())!.height,
      )
      .toBeGreaterThan(100);
    await page.waitForTimeout(900);
    const box = (await page.locator(".proposal-stage").boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    expect((await field.boundingBox())!.y).toBeGreaterThan(before + 100);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Fechar vídeo", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Rever nosso vídeo", exact: true }),
    ).toBeVisible();
    expect((await field.boundingBox())!.y).toBeCloseTo(before, 0);
  });
}

test("reduced motion, controle por teclado e acesso dos noivos preservado", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await opened(page);
  expect(
    await page
      .locator(".proposal-space")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  const replay = page.getByRole("button", {
    name: "Rever nosso vídeo",
    exact: true,
  });
  await expect(replay).toBeVisible();
  await replay.focus();
  await expect(replay).toBeFocused();
  await replay.press("Enter");
  await expect(page.locator(".proposal-space")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await page
    .getByRole("link", { name: "Acesso dos noivos e cerimonial", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("video")).not.toHaveAttribute("src", /mp4/);
  await expect(
    page.getByRole("button", { name: "Assistir ao nosso vídeo", exact: true }),
  ).toBeVisible();
});
