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
        invitation_sent: true,
      },
      {
        ...base,
        id: "export-b",
        name: "Bruno Alencar",
        group_label: "Convidado(a) do noivo",
        is_child: false,
        invitation_sent: false,
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
    db.weddingParty = [
      { guest_id: "export-a", active: true, role: "MADRINHA" },
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
const filters = (page: Page) =>
  page.getByRole("dialog", {
    name: "Filtrar lista de convidados",
    exact: true,
  });
async function choose(page: Page, labels = ["Todos"]) {
  await trigger(page).click();
  for (const label of labels)
    await filters(page)
      .getByRole("checkbox", { name: label, exact: true })
      .click();
  await filters(page)
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
}
async function download(page: Page, labels = ["Todos"]) {
  await choose(page, labels);
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
  test(`Filter layout and Excel/PDF remain accessible at ${width}px`, async ({
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
    await expect(filters(page).getByRole("checkbox")).toHaveCount(12);
    await expect(
      filters(page).getByRole("button", { name: "Continuar", exact: true }),
    ).toBeDisabled();
    if (width >= 768) {
      const boxes = await Promise.all(
        ["Todos", "Convidado(a) do noivo", "Talvez"].map((name) =>
          filters(page)
            .getByRole("checkbox", { name, exact: true })
            .boundingBox(),
        ),
      );
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
    }
    await filters(page).evaluate(async (node) => {
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
      path: test.info().outputPath(`export-filters-${width}.png`),
    });
    await filters(page)
      .getByRole("checkbox", { name: "Todos", exact: true })
      .click();
    await filters(page)
      .getByRole("button", { name: "Continuar", exact: true })
      .click();
    await expect(
      menu(page).getByText("3 convidados serão exportados.", { exact: true }),
    ).toBeVisible();
    await expect(
      menu(page).getByRole("button", { name: "Excel (.xlsx)", exact: true }),
    ).toBeEnabled();
    await expect(
      menu(page).getByRole("button", {
        name: "PDF (.pdf)",
        exact: true,
      }),
    ).toBeEnabled();
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
test("combinations filter both files, all is exclusive, and empty results are recoverable", async ({
  page,
}) => {
  await open(page, 120);
  expect((await download(page)).slice(5)).toHaveLength(123);
  for (const [labels, names] of [
    [["Convidado(a) da noiva"], ["Ágata Silva", "Carla Silva"]],
    [["Confirmados"], ["Ágata Silva"]],
    [["Não irão"], ["Bruno Alencar"]],
    [
      ["Convites enviados", "Padrinho/Madrinha", "Confirmados"],
      ["Ágata Silva"],
    ],
    [
      [
        "Convidado(a) da noiva",
        "Convidado(a) do noivo",
        "Confirmados",
        "Não irão",
      ],
      ["Ágata Silva", "Bruno Alencar"],
    ],
  ] as [string[], string[]][]) {
    expect((await download(page, labels)).slice(5).map((r) => r[1])).toEqual(
      names,
    );
  }
  await trigger(page).click();
  const dialog = filters(page);
  await dialog
    .getByRole("checkbox", { name: "Confirmados", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: "Todos", exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Confirmados", exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "Não irão", exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Todos", exact: true }),
  ).not.toBeChecked();
  await dialog
    .getByRole("checkbox", { name: "Padrinho/Madrinha", exact: true })
    .click();
  await expect(
    dialog.getByText("Nenhum convidado corresponde aos filtros selecionados."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Não irão", exact: true }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  const pending = page.waitForEvent("download");
  await menu(page)
    .getByRole("button", { name: "PDF (.pdf)", exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const content = bytes.toString("latin1");
  expect(content).toContain("Ágata Silva");
  expect(content).not.toContain("Bruno Alencar");
});
test("generation failure permits retry and double click starts only one download", async ({
  page,
}) => {
  await open(page);
  await choose(page);
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
