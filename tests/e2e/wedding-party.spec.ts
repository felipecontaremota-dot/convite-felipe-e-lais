import { test, expect, type Page } from "@playwright/test";
async function fixture(
  page: Page,
  role: "PADRINHO" | "MADRINHA" = "PADRINHO",
  completed = false,
) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.evaluate(
    ({ role, completed }) => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      const guest = db.snapshot.guests[0];
      guest.profile_confirmed_at = "2026-01-01";
      db.snapshot.profile_confirmation = {
        supported: true,
        guest_id: guest.id,
        confirmed_at: guest.profile_confirmed_at,
      };
      db.weddingParty = [
        {
          cycle_id: "cycle-one",
          guest_id: guest.id,
          role,
          active: true,
          accepted_at: completed ? "2026-01-01" : null,
          completed_at: completed ? "2026-01-01" : null,
        },
      ];
      localStorage.setItem("demo-db", JSON.stringify(db));
    },
    { role, completed },
  );
  await page.reload();
}
for (const [width, role] of [
  [320, "MADRINHA"],
  [1280, "PADRINHO"],
] as const) {
  test(`Exclusive ${role} surprise, completion, replay and cards at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page, role);
    await expect(page).toHaveURL(/padrinhos\?surpresa=1/);
    const animation = await page
      .getByRole("button", { name: "Abrir convite especial", exact: true })
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe(width === 320 ? "none" : "party-float");
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.rsvps,
    );
    await expect(
      page.getByText("Você recebeu um convite especial", { exact: true }),
    ).toBeVisible();
    await page.reload();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
            .completed_at,
      ),
    ).toBeNull();
    await page
      .getByRole("button", { name: "Abrir convite especial", exact: true })
      .press("Enter");
    await expect(
      page.getByText(
        role === "MADRINHA"
          ? /aceita ser nossa madrinha/
          : /aceita ser nosso padrinho/,
      ),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByRole("button", {
        name: "Preciso pensar um pouquinho...",
        exact: true,
      })
      .click();
    await expect(page.getByText(/Sem pressão! Esse convite/)).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
            .accepted_at,
      ),
    ).toBeNull();
    await page
      .getByRole("button", { name: "Voltar ao pedido especial", exact: true })
      .click();
    await page
      .getByRole("button", { name: "💙 É claro que aceito!", exact: true })
      .click();
    await expect(
      page.getByText("Agora é oficial!", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
            .completed_at,
      ),
    ).toBeNull();
    await page
      .getByRole("button", {
        name: "Conhecer minha área especial →",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Rever a surpresa ↺", exact: true }),
    ).toBeVisible();
    await page.goto("/padrinhos?surpresa=1");
    await expect(
      page.getByRole("button", { name: "O grande dia", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Abrir convite especial", exact: true }),
    ).toHaveCount(0);
    const persisted = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0],
    );
    expect(persisted.completed_at).toBeTruthy();
    for (const title of [
      "O grande dia",
      "Traje e orientações",
      "Organização da cerimônia",
      "Recado dos noivos",
    ]) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      if (title === "Recado dos noivos")
        await expect(
          page.getByText(/Obrigado por fazer parte deste capítulo/),
        ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Voltar ao Espaço dos Padrinhos",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Rever a surpresa ↺", exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Convite", exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(
      page.getByRole("button", { name: "Espaço dos Padrinhos", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/inicio$/);
    await page
      .getByRole("button", { name: "Espaço dos Padrinhos", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "O grande dia", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/party-menu-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Rever a surpresa ↺", exact: true })
      .click();
    await page.screenshot({
      path: `/tmp/party-envelope-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Abrir convite especial", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "💙 É claro que aceito!", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Conhecer minha área especial →",
        exact: true,
      })
      .click();
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("demo-db")!),
    );
    expect(after.weddingParty).toHaveLength(1);
    expect(after.weddingParty[0].accepted_at).toBe(persisted.accepted_at);
    expect(after.weddingParty[0].completed_at).toBe(persisted.completed_at);
    expect(after.snapshot.rsvps).toEqual(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Common family member cannot enter a promoted member's space; revocation removes access", async ({
  page,
}) => {
  await fixture(page, "PADRINHO", true);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.profile_confirmation.guest_id = db.snapshot.guests[1].id;
    db.snapshot.guests[1].profile_confirmed_at = "2026-01-01";
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Espaço dos Padrinhos", exact: true }),
  ).toHaveCount(0);
  await page.goto("/padrinhos?pagina=recado");
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(
    page.getByText(/Obrigado por fazer parte deste capítulo/),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.profile_confirmation.guest_id = db.snapshot.guests[0].id;
    db.weddingParty[0].active = false;
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.goto("/padrinhos");
  await expect(page).toHaveURL(/\/inicio$/);
});

for (const gender of ["MASCULINE", "FEMININE", null] as const) {
  test(`Admin promotes and revokes ${gender} without modifying RSVP`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Demo noivos", exact: true })
      .click();
    await page.evaluate((gender) => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.guests[0].greeting_form = gender;
      localStorage.setItem("demo-db", JSON.stringify(db));
    }, gender);
    await page.goto("/convidados");
    await page
      .getByRole("button", { name: "Abrir ficha de Convidado Um", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar convidado", exact: true })
      .click();
    const form = page.getByRole("dialog", {
      name: "Editar convidado",
      exact: true,
    });
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).snapshot.rsvps,
    );
    if (!gender)
      await form
        .getByLabel("Classificação especial", { exact: true })
        .selectOption("MADRINHA");
    const promote =
      gender === "MASCULINE" ? "Promover a padrinho" : "Promover a madrinha";
    await form.getByRole("button", { name: promote, exact: true }).click();
    const messageDialog = page.getByRole("dialog", {
      name: "Mensagem especial para Convidado Um",
      exact: true,
    });
    await expect(messageDialog).toBeVisible();
    await messageDialog
      .getByLabel("Trecho personalizado", { exact: true })
      .fill("Você faz parte da nossa história.\n\nCom muito carinho!");
    await messageDialog
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty?.length ||
          0,
      ),
    ).toBe(0);
    await form.getByRole("button", { name: promote, exact: true }).click();
    await messageDialog
      .getByLabel("Trecho personalizado", { exact: true })
      .fill("Você faz parte da nossa história.\n\nCom muito carinho!");
    await messageDialog
      .getByRole("button", { name: "Salvar mensagem e promover", exact: true })
      .click();
    await expect(
      form.getByRole("button", { name: "Remover promoção", exact: true }),
    ).toBeVisible();
    const first = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0].cycle_id,
    );
    await form
      .getByRole("button", { name: "Editar mensagem especial", exact: true })
      .click();
    await expect(
      messageDialog.getByLabel("Trecho personalizado", { exact: true }),
    ).toHaveValue("Você faz parte da nossa história.\n\nCom muito carinho!");
    await messageDialog
      .getByLabel("Trecho personalizado", { exact: true })
      .fill("Mensagem revisada.\n\nSegundo parágrafo.");
    await messageDialog
      .getByRole("button", { name: "Salvar mensagem", exact: true })
      .click();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0].cycle_id,
      ),
    ).toBe(first);
    await form
      .getByRole("button", { name: "Remover promoção", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Remover promoção",
      exact: true,
    });
    await confirm
      .getByRole("button", { name: "Remover promoção", exact: true })
      .click();
    await expect(confirm).toHaveCount(0);
    await form.getByRole("button", { name: promote, exact: true }).click();
    await messageDialog
      .getByLabel("Trecho personalizado", { exact: true })
      .fill("Um novo convite especial.");
    await messageDialog
      .getByRole("button", { name: "Salvar mensagem e promover", exact: true })
      .click();
    await expect(messageDialog).toHaveCount(0);
    const data = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("demo-db")!),
    );
    expect(data.weddingParty).toHaveLength(2);
    expect(data.weddingParty[1].cycle_id).not.toBe(first);
    expect(data.weddingParty[1].completed_at).toBeNull();
    expect(data.snapshot.rsvps).toEqual(before);
  });
}

test("A new promotion cycle restarts automatic presentation even after a completed cycle", async ({
  page,
}) => {
  await fixture(page, "MADRINHA", true);
  await expect(page).toHaveURL(/\/inicio$/);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const old = db.weddingParty[0];
    old.active = false;
    db.weddingParty.push({
      ...old,
      cycle_id: "cycle-two",
      active: true,
      accepted_at: null,
      completed_at: null,
    });
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.reload();
  await expect(page).toHaveURL(/padrinhos\?surpresa=1/);
  await expect(
    page.getByRole("button", { name: "Abrir convite especial", exact: true }),
  ).toBeVisible();
});

for (const width of [320, 768, 1280])
  test(`Paper letter preserves story, personal paragraphs, bold Medina, reveal and safe text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page, "MADRINHA");
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.snapshot.guests[0].name = "Amanda Curcio Cariolano Romão Medina";
      db.weddingParty[0].display_name = "Medina";
      db.weddingParty[0].personal_message =
        "Primeiro parágrafo pessoal.\nCom uma linha preservada.\n\nSegundo parágrafo pessoal.\n\n<script>window.UNSAFE=true</script>";
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Abrir convite especial", exact: true })
      .click();
    const letter = page.getByRole("article", {
      name: "Carta especial de Felipe e Laís",
    });
    await expect(letter).toBeVisible({ timeout: 10000 });
    await expect(letter.locator("strong")).toHaveText(["Medina", "Medina"]);
    const paragraphs = letter.locator("[data-letter-paragraph]");
    const text = await paragraphs.allTextContents();
    expect(text[0]).toBe(
      "Nós, Felipe e Laís, nos conhecemos quase que por acaso.",
    );
    expect(text[8]).toBe(
      "Assim foi na vida dos dois quando você, Medina, apareceu!",
    );
    expect(text[9]).toBe(
      "Primeiro parágrafo pessoal.\nCom uma linha preservada.",
    );
    expect(text[10]).toBe("Segundo parágrafo pessoal.");
    expect(text.at(-1)).toBe("Medina, aceita ser nossa madrinha?");
    await expect(letter.locator("script")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => !!(window as unknown as { UNSAFE?: boolean }).UNSAFE,
      ),
    ).toBe(false);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await paragraphs
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain("PartyCaveat");
    expect(
      await page.evaluate(() => document.fonts.check("25px PartyCaveat")),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/letter-${width}.png` });
    await paragraphs.last().scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "💙 É claro que aceito!", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "💙 É claro que aceito!", exact: true })
      .click();
    await expect(
      page.getByText(
        "Você acaba de ser promovida a uma das pessoas mais importantes do nosso grande dia!",
        { exact: true },
      ),
    ).toBeVisible();
  });
for (const width of [320, 1280])
  test(`Cinematic opening extracts the letter, prevents repeats and reveals on scroll only once at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    const envelope = page.getByRole("button", {
      name: "Abrir convite especial",
      exact: true,
    });
    const start = await page.evaluate(() => performance.now());
    await envelope.press("Enter");
    await expect(envelope).toBeDisabled();
    await envelope.dispatchEvent("click");
    await expect(page.locator("[data-envelope-flight]")).toHaveCount(1);
    const initialTop = await page
      .locator("[data-envelope-letter]")
      .evaluate((el) => el.getBoundingClientRect().top);
    await expect
      .poll(
        () =>
          page
            .locator("[data-envelope-letter]")
            .evaluate((el) => el.getBoundingClientRect().top),
        { timeout: 5000 },
      )
      .toBeLessThan(initialTop - 20);
    await page.screenshot({ path: "/tmp/envelope-opening.png" });
    const letter = page.locator("[data-party-paper]");
    await expect(letter).toBeVisible({ timeout: 10000 });
    expect(
      (await page.evaluate(() => performance.now())) - start,
    ).toBeGreaterThan(4500);
    await expect(page.locator("[data-paper-handoff]")).toHaveCount(0);
    const first = letter.locator("[data-letter-paragraph]").first(),
      last = letter.locator("[data-letter-paragraph]").last();
    await expect(first).toHaveAttribute("data-revealed", "true");
    await expect(last).not.toHaveAttribute("data-revealed", "true");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute("data-revealed", "true");
    await first.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute("data-revealed", "true");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
            .completed_at,
      ),
    ).toBeNull();
  });
test("Letter remains fully readable without IntersectionObserver or animation support", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      value: undefined,
      configurable: true,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await page
    .getByRole("button", { name: "Abrir convite especial", exact: true })
    .click();
  await expect(
    page.getByText("Nós, Felipe e Laís, nos conhecemos quase que por acaso.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "💙 É claro que aceito!", exact: true })
    .click();
  await expect(
    page.getByText("Agora é oficial!", { exact: true }),
  ).toBeVisible();
});

test("Disabled CSS animation cannot strand the opening sequence", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Abrir convite especial", exact: true })
    .press("Enter");
  await page.addStyleTag({
    content:
      "[data-envelope-flight], [data-envelope-shell], [data-envelope-letter], [data-party-flap], [data-envelope-seal] { animation:none!important; }",
  });
  await expect(page.locator("[data-party-paper]")).toBeVisible({
    timeout: 10000,
  });
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
          .completed_at,
    ),
  ).toBeNull();
});
