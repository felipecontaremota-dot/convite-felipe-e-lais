import { test, expect, type Page } from "@playwright/test";
import { readSheet } from "read-excel-file/node";
import { guestExportHeaders } from "../../src/features/guests/guestExport";
async function open(page: Page, extra = 0) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await page.evaluate((extra) => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const s = db.snapshot,
      base = s.guests[0],
      unit = s.invitations[0];
    s.guests = [
      {
        ...base,
        id: "export-a",
        name: "Ágata Silva",
        group_label: "Convidado(a) da noiva",
        is_child: true,
      },
      {
        ...base,
        id: "export-b",
        name: "Bruno Alencar",
        group_label: "Convidado(a) do noivo",
        is_child: false,
      },
      {
        ...base,
        id: "export-c",
        name: "Carla Silva",
        group_label: "Convidado(a) da noiva",
        is_child: false,
      },
      ...Array.from({ length: extra }, (_, n) => ({
        ...base,
        id: `extra-${n}`,
        name: `Pessoa extra ${n}`,
        group_label: "Convidado(a) do noivo",
      })),
    ];
    unit.name = "Família Silva";
    s.contacts = [
      {
        guest_id: "export-a",
        email: "agata@example.test",
        whatsapp: "5562998784778",
      },
    ];
    s.rsvps = [
      { event_id: s.event.id, guest_id: "export-a", status: "CONFIRMED" },
      { event_id: s.event.id, guest_id: "export-b", status: "DECLINED" },
    ];
    localStorage.setItem("demo-db", JSON.stringify(db));
  }, extra);
  await page.reload();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
}
const trigger = (page: Page) =>
  page.getByRole("button", { name: "Baixar lista de convidados", exact: true });
const menu = (page: Page) =>
  page.getByRole("dialog", { name: "Baixar lista de convidados", exact: true });
async function download(page: Page) {
  await trigger(page).click();
  const promise = page.waitForEvent("download");
  await menu(page)
    .getByRole("button", { name: "Excel (.xlsx)", exact: true })
    .click();
  const file = await promise;
  expect(file.suggestedFilename()).toMatch(
    /^Felipe_e_Lais_Lista_de_Convidados_\d{2}-\d{2}-\d{4}\.xlsx$/,
  );
  return readSheet((await file.path())!, "Convidados");
}
for (const width of [320, 375, 390, 768, 1280])
  test(`Excel download and disabled PDF remain accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const buttons = page.getByRole("button");
    const labels = await buttons.allTextContents();
    expect(labels.indexOf("Baixar lista de convidados")).toBeGreaterThan(
      labels.indexOf("Adicionar convidado"),
    );
    expect(labels.indexOf("Baixar lista de convidados")).toBeLessThan(
      labels.indexOf("Enviar todos os convites"),
    );
    await trigger(page).click();
    await expect(
      menu(page).getByText("3 convidados serão exportados.", { exact: true }),
    ).toBeVisible();
    await expect(
      menu(page).getByRole("button", { name: "Excel (.xlsx)", exact: true }),
    ).toBeEnabled();
    await expect(
      menu(page).getByRole("button", {
        name: "PDF (.pdf) — Em breve",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await menu(page).evaluate(async (node) => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => {
            const target = (animation.effect as KeyframeEffect | null)?.target;
            return (
              target instanceof Element &&
              target.contains(node) &&
              animation.effect?.getComputedTiming().iterations !== Infinity
            );
          })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({
      path: test.info().outputPath(`export-menu-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    const rows = await download(page);
    expect(rows[4]).toEqual(guestExportHeaders);
    expect(rows.slice(5).map((r) => r[1])).toEqual([
      "Ágata Silva",
      "Bruno Alencar",
      "Carla Silva",
    ]);
    expect(rows[5][2]).toBe("(62) 9 9878-4778");
    const stored = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).snapshot.invitations[0],
    );
    expect(rows[5][4]).toBe(
      `https://example.test/convite-felipe-e-lais/c/${stored.sharing_code}`,
    );
    expect(rows[5][5]).toBe(stored.pin);
    expect(rows[5][6]).toBe("Família Silva");
    expect(rows[6][2]).toBeNull();
    expect(rows[7][8]).toBe("Pendente");
    await expect(
      page.getByText("Arquivo Excel gerado. Download iniciado.", {
        exact: true,
      }),
    ).toBeVisible();
  });
test("export combines the actual search and tag/RSVP filters and includes offscreen records", async ({
  page,
}) => {
  await open(page, 120);
  expect((await download(page)).slice(5)).toHaveLength(123);
  for (const [query, filter, names] of [
    ["", "Convidado(a) da noiva", ["Ágata Silva", "Carla Silva"]],
    ["BRUNO", "ALL", ["Bruno Alencar"]],
    ["Família Silva", "CONFIRMED", ["Ágata Silva"]],
    ["Silva", "Convidado(a) da noiva", ["Ágata Silva", "Carla Silva"]],
    ["", "DECLINED", ["Bruno Alencar"]],
  ] as const) {
    await page
      .getByLabel("Buscar pessoa ou família", { exact: true })
      .fill(query);
    await page
      .getByLabel("Filtrar convidados", { exact: true })
      .selectOption(filter);
    expect((await download(page)).slice(5).map((r) => r[1])).toEqual([
      ...names,
    ]);
  }
  await page
    .getByLabel("Buscar pessoa ou família", { exact: true })
    .fill("Não existe");
  await trigger(page).click();
  await expect(
    menu(page).getByText("Nenhum convidado encontrado para exportação.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    menu(page).getByRole("button", { name: "Excel (.xlsx)", exact: true }),
  ).toBeDisabled();
});
test("generation failure permits retry and double click starts only one download", async ({
  page,
}) => {
  await open(page);
  await trigger(page).click();
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => {
      URL.createObjectURL = original;
      throw Error("Controlled download failure");
    };
  });
  await menu(page)
    .getByRole("button", { name: "Excel (.xlsx)", exact: true })
    .click();
  await expect(menu(page).getByRole("alert")).toHaveText(
    "Não foi possível gerar o Excel. Tente novamente.",
  );
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  const event = page.waitForEvent("download");
  await menu(page)
    .getByRole("button", { name: "Excel (.xlsx)", exact: true })
    .evaluate((n) => {
      (n as HTMLButtonElement).click();
      (n as HTMLButtonElement).click();
    });
  await event;
  await expect(menu(page)).toHaveCount(0);
  expect(downloads).toHaveLength(1);
});
for (const role of ["convidado", "cerimonial"])
  test(`${role} has no export access or new controls`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: `Demo ${role}`, exact: true })
      .click();
    await expect(trigger(page)).toHaveCount(0);
    await page.goto("/convidados");
    await expect(trigger(page)).toHaveCount(0);
  });
