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
      if (title === "O grande dia") {
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Falta pouco para você estar conosco no Villarejo.", {
            exact: true,
          }),
        ).toBeVisible();
      } else
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
      if (title === "Recado dos noivos")
        await expect(
          page.getByText(/Estamos preparando um recado com carinho/),
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
    page.getByText(/Estamos preparando um recado com carinho/),
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
    await page.setViewportSize({
      width: gender === "MASCULINE" ? 1280 : gender === "FEMININE" ? 390 : 320,
      height: 900,
    });
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
      .getByLabel("Nome ou apelido carinhoso", { exact: true })
      .fill("Minha querida amiga");
    await expect(
      messageDialog.getByLabel("Recado personalizado", { exact: true }),
    ).toHaveAttribute(
      "placeholder",
      "Digite um recado carinhoso e personalizado",
    );
    await messageDialog
      .getByLabel("Recado personalizado", { exact: true })
      .fill("Recado separado da carta.\n\nCom carinho, Felipe & Laís!");
    await page.screenshot({
      path: `/tmp/party-admin-note-${gender || "unset"}.png`,
      animations: "disabled",
    });
    await messageDialog
      .getByRole("button", { name: "Salvar e promover", exact: true })
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
    await expect(
      messageDialog.getByLabel("Nome ou apelido carinhoso", { exact: true }),
    ).toHaveValue("Minha querida amiga");
    await expect(
      messageDialog.getByLabel("Recado personalizado", { exact: true }),
    ).toHaveValue("Recado separado da carta.\n\nCom carinho, Felipe & Laís!");
    await messageDialog
      .getByLabel("Recado personalizado", { exact: true })
      .fill("Novo recado individual.\n\nSegundo parágrafo.");
    await messageDialog
      .getByLabel("Nome ou apelido carinhoso", { exact: true })
      .fill("Meu bem");
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
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0]
            .display_name,
      ),
    ).toBe("Meu bem");
    await form
      .getByRole("button", { name: "Editar mensagem especial", exact: true })
      .click();
    await messageDialog
      .getByLabel("Nome ou apelido carinhoso", { exact: true })
      .fill("");
    await messageDialog
      .getByRole("button", { name: "Salvar mensagem", exact: true })
      .click();
    const cleared = await page.evaluate(
      () => JSON.parse(localStorage.getItem("demo-db")!).weddingParty[0],
    );
    expect(cleared.display_name).toBeNull();
    expect(cleared.couples_note).toBe(
      "Novo recado individual.\n\nSegundo parágrafo.",
    );
    expect(cleared.cycle_id).toBe(first);
    expect(cleared.personal_message).toBe(
      "Mensagem revisada.\n\nSegundo parágrafo.",
    );
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
      .getByRole("button", { name: "Salvar e promover", exact: true })
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
  test(`Paper letter preserves story, personal paragraphs, bold optional treatment, reveal and safe text at ${width}px`, async ({
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
    ).toContain("PartyHand");
    expect(
      await page.evaluate(() => document.fonts.check("25px PartyHand")),
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
// Pause the browser's real animations at real intermediate frames; screenshot and inspect geometry.
// No fake timers for sequencing: finish() resolves each native Animation.finished promise.
async function pauseEnvelope(page: Page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const result = animate.apply(this, args);
      if (
        this.matches(
          "[data-envelope-seal],[data-party-flap],[data-envelope-letter],[data-envelope-flash]",
        )
      )
        result.pause();
      return result;
    };
  });
}
async function position(
  page: Page,
  selector: string,
  progress: number,
  finish = false,
) {
  const el = page.locator(selector);
  await expect.poll(() => el.evaluate((e) => e.getAnimations().length)).toBe(1);
  await el.evaluate(
    (e, { progress, finish }) => {
      const a = e.getAnimations()[0]!;
      a.currentTime = Number(a.effect!.getTiming().duration) * progress;
      if (finish) a.finish();
    },
    { progress, finish },
  );
}
for (const width of [320, 768, 1280])
  test(`Physical envelope frames and reversible reading at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await pauseEnvelope(page);
    await fixture(page);
    const frame = async (name: string) => {
      const path = testInfo.outputPath(`${name}-${width}.png`);
      await page.screenshot({ path });
      await testInfo.attach(name, { path, contentType: "image/png" });
    };
    const envelope = page.getByRole("button", {
      name: "Abrir convite especial",
      exact: true,
    });
    const paper = page.locator("[data-envelope-letter]");
    const letter = page.locator("[data-party-paper]");
    await expect(paper).toHaveCSS("visibility", "hidden");
    await expect(envelope).toHaveAttribute("data-phase", "closed");
    // More than the former automatic extraction delay: no unsolicited reveal on mount.
    await page.waitForTimeout(3800);
    await expect(paper).toHaveCSS("visibility", "hidden");
    expect(await paper.evaluate((el) => el.getAnimations().length)).toBe(0);
    await frame("01-closed");
    await envelope.press("Enter");
    await envelope.dispatchEvent("click");
    await expect(envelope).toBeDisabled();
    await position(page, "[data-envelope-seal]", 1, true);
    await position(page, "[data-party-flap]", 0.25);
    await expect(paper).toHaveCSS("visibility", "hidden");
    await frame("02-flap-partial");
    await position(page, "[data-party-flap]", 0.999);
    await expect(paper).toHaveCSS("visibility", "hidden");
    await frame("03-flap-open");
    await position(page, "[data-party-flap]", 1, true);
    await position(page, "[data-envelope-letter]", 0);
    const startTop = await paper.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const order = await envelope.evaluate((el) => ({
      open: Number((el as HTMLElement).dataset.openedAt),
      extract: Number((el as HTMLElement).dataset.extractedAt),
    }));
    expect(order.extract).toBeGreaterThan(order.open);
    await frame("04-extraction-start");
    await position(page, "[data-envelope-letter]", 0.5);
    expect(
      await paper.evaluate((el) => el.getBoundingClientRect().top),
    ).toBeLessThan(startTop - 50);
    await frame("05-extraction-partial");
    await expect(letter).toHaveCount(0);
    await expect(page.locator("[data-envelope-flash]")).toHaveCSS(
      "opacity",
      "0",
    );
    await position(page, "[data-envelope-letter]", 0.999);
    await frame("06-extraction-complete");
    await position(page, "[data-envelope-letter]", 1, true);
    await position(page, "[data-envelope-flash]", 0.999);
    await expect(page.locator("[data-envelope-flash]")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    expect(
      Number(
        await page
          .locator("[data-envelope-flash]")
          .evaluate((e) => getComputedStyle(e).opacity),
      ),
    ).toBeGreaterThan(0.99);
    await expect(letter).toHaveCount(0);
    await frame("07-white-peak");
    await position(page, "[data-envelope-flash]", 1, true);
    await expect(letter).toBeVisible();
    await expect(page.locator("[data-paper-handoff]")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await frame("08-white-paper");
    const first = letter.locator("[data-letter-paragraph]").first();
    const last = letter.locator("[data-letter-paragraph]").last();
    await expect(first).toHaveCSS("opacity", "1");
    await expect(last).toHaveCSS("opacity", "0");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveCSS("opacity", "1");
    await expect(first).toHaveCSS("opacity", "1"); // Above the reading region remains readable.
    await frame("09-scroll-down");
    await first.scrollIntoViewIfNeeded();
    await expect(last).toHaveCSS("opacity", "0");
    await expect(first).toHaveCSS("opacity", "1");
    expect(
      await first.evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("1.35s, 1.35s");
    await frame("10-scroll-up");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveCSS("opacity", "1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
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

test("Missing Web Animations cannot strand the opening sequence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "animate", {
      value: undefined,
      configurable: true,
    });
  });
  await fixture(page);
  await page
    .getByRole("button", { name: "Abrir convite especial", exact: true })
    .press("Enter");
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

for (const width of [320, 390, 1280]) {
  test(`Party content, individual note, history and shared venue at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page, "MADRINHA", true);
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("demo-db")!);
      db.weddingParty[0].personal_message = "Texto exclusivo da carta";
      db.weddingParty[0].couples_note =
        "Querida amiga, 💙\n\nEste recado é só seu. <b>Texto literal.</b>";
      db.snapshot.event.address = "Endereço compartilhado do Villarejo";
      localStorage.setItem("demo-db", JSON.stringify(db));
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/padrinhos");
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("demo-db")!),
    );
    await page
      .getByRole("button", { name: "O grande dia", exact: true })
      .click();
    const phrase = page.getByText(
      "Falta pouco para você estar conosco no Villarejo.",
      { exact: true },
    );
    await expect(phrase).toBeVisible();
    expect(await phrase.evaluate((el) => getComputedStyle(el).textAlign)).toBe(
      "center",
    );
    await expect(
      page.getByRole("heading", { name: "O grande dia", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Endereço compartilhado do Villarejo", { exact: true }),
    ).toBeVisible();
    const logo = page.getByRole("link", {
      name: "Visitar o Instagram do Villarejo Eventos",
      exact: true,
    });
    await expect(logo).toHaveAttribute("target", "_blank");
    await expect(logo).toHaveAttribute("rel", "noopener noreferrer");
    await expect(logo).toHaveAttribute(
      "href",
      "https://www.instagram.com/villarejoeventos?vrfl=M2tpa292Nzc5bDBz",
    );
    await expect(
      page.getByLabel("Villarejo Eventos", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/party-content-dia-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.goBack();
    await expect(
      page.getByRole("button", { name: "O grande dia", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Traje e orientações", exact: true })
      .click();
    await expect(
      page.getByText(/O azul simboliza confiança, lealdade/),
    ).toBeVisible();
    await expect(
      page.getByText(/Mais do que a combinação das cores/),
    ).toBeVisible();
    expect(
      await page
        .getByText("Madrinhas:", { exact: true })
        .evaluate((el) => getComputedStyle(el).fontWeight),
    ).toBe("700");
    await page.screenshot({
      path: `/tmp/party-content-traje-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Voltar ao Espaço dos Padrinhos",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Organização da cerimônia", exact: true })
      .click();
    await expect(
      page.getByText(/30 minutos de antecedência ao horário da cerimônia/),
    ).toBeVisible();
    await expect(page.getByText(/liderada pelo Gustavo Morais/)).toBeVisible();
    await page.screenshot({
      path: `/tmp/party-content-cerimonia-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Voltar ao Espaço dos Padrinhos",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Recado dos noivos", exact: true })
      .click();
    const note = page.getByText(
      "Querida amiga, 💙\n\nEste recado é só seu. <b>Texto literal.</b>",
      { exact: true },
    );
    await expect(note).toBeVisible();
    expect(await note.textContent()).toContain("\n\n");
    await expect(note.locator("b")).toHaveCount(0);
    await expect(
      page.getByText("Texto exclusivo da carta", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(note).toBeVisible();
    await page.screenshot({
      path: `/tmp/party-content-recado-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("demo-db")!),
    );
    expect(after.weddingParty).toEqual(before.weddingParty);
    expect(after.snapshot.rsvps).toEqual(before.snapshot.rsvps);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const scenario of [
  {
    name: "desktop",
    role: "PADRINHO",
    width: 1280,
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    apple: false,
  },
  {
    name: "Android",
    role: "MADRINHA",
    width: 390,
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
    apple: false,
  },
  {
    name: "iPhone",
    role: "MADRINHA",
    width: 320,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    apple: true,
  },
] as const) {
  test(`Party address and individual ceremony on ${scenario.name}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: scenario.width, height: 900 },
      userAgent: scenario.ua,
    });
    try {
      await context.route("https://maps.test/**", (route) =>
        route.fulfill({ body: "Local de teste", contentType: "text/html" }),
      );
      const page = await context.newPage();
      await fixture(page, scenario.role, true);
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        db.snapshot.event.address = "Endereço cadastrado do Villarejo";
        db.snapshot.event.gps_url = "https://maps.test/villarejo-oficial";
        db.weddingParty[0].couples_note = "Recado individual preservado";
        localStorage.setItem("demo-db", JSON.stringify(db));
      });
      await page.goto("/padrinhos?pagina=dia");
      const link = page.getByRole("link", {
        name: "Abrir localização do Villarejo",
        exact: true,
      });
      await expect(link).toHaveAttribute(
        "href",
        "https://maps.test/villarejo-oficial",
      );
      await expect(link).toHaveCSS("text-decoration-line", "none");
      const address = page.getByText("Endereço cadastrado do Villarejo", {
        exact: true,
      });
      await expect(address).toHaveCSS("text-align", "center");
      await expect(address).toHaveCSS("font-size", "18px");
      await expect(address).toHaveCSS("line-height", "29px");
      await expect(address).toHaveCSS("color", "rgb(244, 230, 189)");
      await link.focus();
      await expect(link).toBeFocused();
      const popup = context.waitForEvent("page");
      await link.press("Enter");
      const opened = await popup;
      await opened.waitForURL("https://maps.test/villarejo-oficial");
      await opened.close();
      await page.screenshot({
        path: `/tmp/party-content-address-${scenario.name}.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", {
          name: "Voltar ao Espaço dos Padrinhos",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Organização da cerimônia", exact: true })
        .click();
      const ending = scenario.role === "PADRINHO" ? "lo" : "la";
      await expect(
        page.getByText(new RegExp(`recebê-${ending} e conduzi-${ending}`)),
      ).toBeVisible();
      await expect(
        page.getByText(
          new RegExp(
            scenario.role === "PADRINHO"
              ? "Você foi escolhido porque"
              : "Você foi escolhida porque",
          ),
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          new RegExp(scenario.role === "PADRINHO" ? "recebê-la" : "recebê-lo"),
        ),
      ).toHaveCount(0);
      await expect(
        page.getByText(/30 minutos de antecedência ao horário da cerimônia/),
      ).toBeVisible();
      await page.screenshot({
        path: `/tmp/party-content-personal-${scenario.name}.png`,
        animations: "disabled",
      });
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("demo-db")!);
        db.snapshot.event.gps_url = null;
        db.snapshot.event.latitude = null;
        db.snapshot.event.longitude = null;
        localStorage.setItem("demo-db", JSON.stringify(db));
      });
      await page.goto("/padrinhos?pagina=dia");
      await expect(link).toHaveAttribute(
        "href",
        `${scenario.apple ? "https://maps.apple.com/?daddr=" : "https://www.google.com/maps/dir/?api=1&destination="}${encodeURIComponent("Endereço cadastrado do Villarejo")}`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const db = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("demo-db")!),
      );
      expect(db.weddingParty[0].completed_at).toBe("2026-01-01");
      expect(db.weddingParty[0].couples_note).toBe(
        "Recado individual preservado",
      );
    } finally {
      await context.close();
    }
  });
}
test("Ceremony with an inconsistent promotion role uses neutral copy", async ({
  page,
}) => {
  await fixture(page, "MADRINHA", true);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.weddingParty[0].role = "UNKNOWN";
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  await page.goto("/padrinhos?pagina=cerimonia");
  await expect(page.getByText(/receber você e conduzir você/)).toBeVisible();
  await expect(
    page.getByText(/Você faz parte da nossa história, e ter você/),
  ).toBeVisible();
  await expect(page.getByText(/Você foi escolhid[oa]/)).toHaveCount(0);
});
