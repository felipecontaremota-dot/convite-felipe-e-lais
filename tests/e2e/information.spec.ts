import { test, expect, type Page } from "@playwright/test";
async function openInformation(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await page.getByRole("link", { name: "Informações", exact: true }).click();
}
const approvedCopy = [
  "Preparamos cada detalhe com muito amor, carinho e uma dose enorme de ansiedade! 💕 E sabe o que vai tornar tudo ainda mais especial? Ter você celebrando esse momento com a gente!",
  "Mas, antes de colocar o look, preparar o coração e partir para a festa, temos alguns recados importantes! 👀✨",
  "📍 1. CERIMÔNIA E FESTA: TUDO NO MESMO LUGAR!",
  "A cerimônia e a recepção acontecerão no Villarejo, um espaço lindo, com mais de 8.800 m², localizado em Aparecida de Goiânia, a aproximadamente 3 km do Terminal Araguaia, atravessando a BR-153.",
  'Quer saber como chegar? É só acessar a tela "Local" do nosso convite! Lá você encontra a localização e pode planejar seu trajeto com tranquilidade. Só não vale se perder e chegar depois da entrada da noiva, hein?!',
  "🚗 2. PODE VIR DE CARRO!",
  "Não precisa se preocupar com estacionamento! O espaço conta com capacidade para até 100 veículos. Então, pode vir tranquilo, porque lugar para estacionar não vai faltar! 🅿️✨",
  "✅ 3. CONFIRME SUA PRESENÇA! É MUITO IMPORTANTE!",
  'Aqui temos um pedido especial: não esqueça de confirmar sua presença na tela "Presença"! 💙',
  "Nossa lista de convidados é fechada, em razão da organização e dos serviços contratados. Por isso, somente poderão acessar o evento as pessoas que estiverem devidamente incluídas na lista.",
  'E tem mais: depois de confirmar sua presença, você terá acesso ao seu QR Code na tela "Convites", que será utilizado para conferir sua entrada no grande dia! 📲🎟️',
  "Ou seja: confirmou, garantiu seu lugar na nossa celebração! 🥳",
  "📱 4. MANTENHA SEUS DADOS ATUALIZADOS!",
  'Dá uma passadinha na tela "Perfil" e confira se seu e-mail e número de WhatsApp estão certinhos, combinado?',
  "Podemos enviar algumas novidades, lembretes e informações importantes por esses canais. E ninguém quer ficar de fora dos recadinhos da noiva, né?! 😂💌",
  "📲 5. NOSSO CONVITE TAMBÉM VIRA UM APP!",
  "Simmm! Nosso convite é tão especial que você pode até instalar no seu celular! 😍",
  "É bem simples:",
  "• Acesse www.felipeelais2026.com.br ou o link individual que você recebeu.",
  "• Abra o menu do navegador (≡).",
  '• Procure a opção "Instalar" ou "Instalar e criar atalho".',
  "• Confirme a instalação e pronto! 🎉",
  "Assim, nosso convite fica pertinho de você, direto na tela do seu celular, facilitando o acesso à programação, à localização e a todas as novidades!",
  "As opções de instalação podem variar conforme o celular e o navegador utilizado.",
  "🥂 6. E, POR ÚLTIMO, MAS NÃO MENOS IMPORTANTE: DIVIRTA-SE!",
  "Essa é a nossa regra favorita! 💃🕺",
  "Venha com o coração leve, a alegria lá em cima e muita disposição para comemorar!",
  "Queremos abraços apertados, muitas risadas, fotos, dança e lembranças que vamos guardar para sempre! 📸✨",
  "Afinal, o casamento é nosso, mas a festa é de todos nós! 🎉💙",
  "Estamos imensamente felizes por dividir esse capítulo tão importante das nossas vidas com pessoas especiais como você!",
  "Com muito amor e uma ansiedade que já não cabe no peito,",
  "Felipe & Laís 💍💙",
  "15 de dezembro de 2026 — O dia em que nossa história ganha um novo capítulo, e você faz parte dele! ✨",
];
for (const width of [320, 375, 390, 768, 1280]) {
  test(`approved wedding information is readable and preserved at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openInformation(page);
    await expect(
      page.getByRole("heading", { name: "Informações", exact: true }),
    ).toBeVisible();
    const content = page.getByTestId("wedding-information");
    await expect(content.getByRole("heading")).toHaveCount(8);
    const text = (await content.innerText()).replace(/\s+/g, " ").trim();
    expect(text).toBe(
      [
        "O nosso dia",
        "15 de dezembro de 2026, às 16h",
        "💙💍 Alguns recados importantes para o nosso grande dia!",
        ...approvedCopy,
      ].join(" "),
    );
    for (const bold of [
      "Ter você celebrando esse momento com a gente!",
      "Villarejo",
      "8.800 m²",
      "100 veículos",
      "confirmou, garantiu seu lugar na nossa celebração!",
      "Com muito amor e uma ansiedade que já não cabe no peito,",
      "Felipe & Laís",
    ]) {
      await expect(content.getByText(bold, { exact: true })).toHaveCSS(
        "font-weight",
        "700",
      );
    }
    await expect(
      content.getByText(
        "As opções de instalação podem variar conforme o celular e o navegador utilizado.",
        { exact: true },
      ),
    ).toHaveCSS("font-style", "italic");
    await expect(
      content.getByText(
        /Usamos nome|revogar consentimentos|America\/Sao_Paulo|serão publicados|Seus dados/,
      ),
    ).toHaveCount(0);
    expect(text).not.toContain("**");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = (await content.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(page.getByTestId("compact-countdown")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Assistir ao nosso vídeo",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`information-${width}-top.png`),
    });
    await content
      .getByRole("heading", {
        name: "📲 5. NOSSO CONVITE TAMBÉM VIRA UM APP!",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`information-${width}-app.png`),
    });
    await content
      .getByText("Felipe & Laís", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`information-${width}-closing.png`),
    });
    await expect(
      page.getByRole("button", { name: "Sair deste dispositivo", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          "Com carinho, Felipe & Laís · Seus dados são usados para organizar o casamento.",
          { exact: true },
        )
        .filter({ visible: true }),
    ).toBeVisible();
  });
}
test("inline guest links preserve routes and the site link opens the specified HTTPS address", async ({
  page,
}) => {
  await openInformation(page);
  for (const [label, route] of [
    ["Local", "/como-chegar"],
    ["Presença", "/presenca"],
    ["Convites", "/ingressos"],
    ["Perfil", "/perfil"],
  ]) {
    const link = page
      .getByTestId("wedding-information")
      .getByRole("link", { name: `"${label}"`, exact: true });
    await expect(link).toHaveAttribute("href", route);
    await expect(link).toHaveCSS("font-weight", "700");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await page.getByRole("link", { name: "Informações", exact: true }).click();
  }
  const site = page
    .getByTestId("wedding-information")
    .getByRole("link", { name: "www.felipeelais2026.com.br", exact: true });
  await expect(site).toHaveAttribute("href", "https://felipeelais2026.com.br");
  await page.keyboard.press("Tab");
  await site.focus();
  await expect(site).toHaveCSS("outline-style", "solid");
  await page.route("https://felipeelais2026.com.br/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Destino do convite</title>",
    }),
  );
  await site.press("Enter");
  await expect(page).toHaveURL("https://felipeelais2026.com.br/");
});
test("privacy disclosure remains accessible separately and logout still ends the guest session", async ({
  page,
}) => {
  await openInformation(page);
  const toggle = page.getByRole("button", {
    name: "Privacidade e seus dados",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("information-privacy-details")).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("information-privacy-details")).toContainText(
    "pedir correção ou exclusão aos noivos pela área Mensagens",
  );
  await expect(page.getByTestId("information-privacy-details")).toContainText(
    "Contatos não integram o QR",
  );
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: "Informações", exact: true }),
  ).toHaveCount(0);
  await page.goto("/informacoes");
  await expect(page.getByTestId("wedding-information")).toHaveCount(0);
});

test("information retains the shared video, countdown and guest navigation", async ({
  page,
}) => {
  // Use the existing media fixture: verify player interaction independently of codecs/network.
  await page.route("**/pedido-casamento-web.mp4", () => {});
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      get: () => 4,
    });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  await openInformation(page);
  await page
    .getByRole("button", { name: "Assistir ao nosso vídeo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fechar vídeo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar vídeo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Informações", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("compact-countdown")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baixar app", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/informacoes$/);
});
