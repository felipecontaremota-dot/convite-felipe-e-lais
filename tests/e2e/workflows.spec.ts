import { test, expect } from "@playwright/test";
const code = "DemoConviteExclusivoFelipeLais2026";
async function start(
  page: import("@playwright/test").Page,
  role = "convidado",
) {
  await page.goto("/");
  await page.getByRole("button", { name: `Demo ${role}`, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sair deste dispositivo" }),
  ).toBeVisible();
}
async function navigation(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.getByRole("link", { name: label, exact: true }).click();
}
async function noOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("link exclusivo, RSVP individual, ingressos, presentes, mensagem e localização", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/c/${code}`);
  await expect(page.getByText("Olá, Família Demo!")).toBeVisible();
  await expect(page.getByText("Convidado Um", { exact: true })).toHaveCount(0);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("9999");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(
    page.getByText("Código ou PIN inválido.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page.getByText("Bem-vindos, Família Demo")).toBeVisible();
  await noOverflow(page);
  await navigation(page, "Presença");
  await page
    .getByRole("button", {
      name: "Salvar presença de Convidada Dois",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Sincronizado com sucesso.").filter({ visible: true }),
  ).toBeVisible();
  // Each card owns its choice. Only the second person is updated.
  const second = page
    .getByRole("button", {
      name: "Salvar presença de Convidada Dois",
      exact: true,
    })
    .locator("..");
  await second.getByRole("radio", { name: "Vou participar" }).click();
  await second
    .getByRole("button", { name: "Salvar presença de Convidada Dois" })
    .click();
  await navigation(page, "Ingressos");
  await expect(
    page.getByText("Convidado Um", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Convidada Dois", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Criança Demo", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await navigation(page, "Presentes");
  await page
    .getByRole("checkbox", { name: "Tenho interesse em Um novo capítulo" })
    .click();
  await expect(
    page.getByText("Sincronizado com sucesso.").filter({ visible: true }),
  ).toBeVisible();
  await navigation(page, "Perfil");
  await page
    .getByRole("radio", { name: "Convidada Dois", exact: true })
    .click();
  await page
    .getByLabel("E-mail de Convidada Dois", { exact: true })
    .fill("person-demo@example.com");
  await page
    .getByRole("button", {
      name: "Salvar contato de Convidada Dois",
      exact: true,
    })
    .click();
  await navigation(page, "Mensagens");
  await expect(
    page.getByRole("radio", { name: "Convidada Dois", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Que alegria participar!");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    page.getByText("Que alegria participar!", { exact: true }),
  ).toBeVisible();
  await navigation(page, "Como chegar");
  await expect(
    page.getByRole("button", { name: "Google Maps", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Local a definir", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.goto("/painel");
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
});
test("admin cria família, convidado, presente e regra; desktop e tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page, "noivos");
  await expect(
    page.getByText("O nosso casamento, em cada detalhe"),
  ).toBeVisible();
  await noOverflow(page);
  await navigation(page, "Famílias");
  await page
    .getByLabel("Nome da nova família", { exact: true })
    .fill("Família Nova Demo");
  await page
    .getByRole("button", { name: "Criar família", exact: true })
    .click();
  await expect(
    page.getByText("Família Nova Demo", { exact: true }).first(),
  ).toBeVisible();
  await navigation(page, "Convidados");
  await page
    .getByLabel("Nome do convidado", { exact: true })
    .fill("Pessoa Nova Demo");
  await page
    .getByRole("radio", { name: "Família Nova Demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar integrante", exact: true })
    .click();
  await expect(
    page
      .getByText("Pessoa Nova Demo", { exact: true })
      .filter({ visible: true })
      .last(),
  ).toBeVisible();
  await navigation(page, "Presentes");
  await page
    .getByLabel("Título do presente", { exact: true })
    .first()
    .fill("Nova sugestão demo");
  await page
    .getByRole("button", { name: "Criar presente", exact: true })
    .click();
  await expect(
    page.getByLabel("Título do presente", { exact: true }).last(),
  ).toHaveValue("Nova sugestão demo");
  await navigation(page, "Notificações");
  await expect(
    page.getByRole("button", { name: "Salvar lembrete", exact: true }),
  ).toHaveCount(9);
  await page.setViewportSize({ width: 820, height: 1180 });
  await noOverflow(page);
});
test("cerimonial: QR de demonstração, conferência, check-in idempotente e isolamento", async ({
  page,
}) => {
  await start(page);
  await navigation(page, "Ingressos");
  await expect(
    page.getByRole("button", { name: "Regenerar ingresso", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("demo-db")!).tickets[0].token as string,
  );
  await page.getByRole("button", { name: "Sair deste dispositivo" }).click();
  await start(page, "cerimonial");
  await page
    .getByLabel("Token ou conteúdo do QR (entrada acessível)")
    .fill(`wedding://ticket/${token}`);
  await page
    .getByRole("button", { name: "Validar ingresso", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar entrada", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("0 / 1 presentes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar entrada", exact: true })
    .click();
  await expect(
    page.getByText("1 / 1 presentes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Validar ingresso", exact: true })
    .click();
  await expect(
    page.getByText("CONVIDADO JÁ REGISTRADO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar entrada", exact: true }),
  ).toHaveCount(0);
  await page.goto("/gestao-mensagens");
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
  await page.goto("/checkin");
  await expect(
    page.getByRole("button", {
      name: "Registrar entrada manualmente: Convidado Um",
      exact: true,
    }),
  ).toBeVisible();
});
test("offline: check-in manual persiste e sincroniza ao reconectar", async ({
  page,
  context,
}) => {
  await start(page, "cerimonial");
  await page
    .getByRole("button", { name: "Preparar / atualizar cache offline" })
    .click();
  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Registrar entrada manualmente: Convidado Um",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Confirmar entrada", exact: true })
    .click();
  await expect(
    page.getByText(
      "Salvo neste dispositivo. Será sincronizado quando houver conexão.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("1 / 1 presentes", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/aguardando sincronização/)).toHaveCount(0);
  await expect(
    page.getByText("1 / 1 presentes", { exact: true }),
  ).toBeVisible();
});
test("uma sessão existente não autoriza um novo código inválido", async ({
  page,
}) => {
  await start(page);
  await page.goto("/c/CodigoInvalidoMesmoComSessaoExistente");
  await expect(
    page.getByText(
      "O convite ainda não está disponível. Tente novamente mais tarde.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Seu convite", { exact: true })).toBeVisible();
  expect(page.url()).toContain("/c/");
});

test("cadastro familiar: contato, PIN sugerido/customizado, copiar e regenerar link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page, "noivos");
  await navigation(page, "Famílias");
  await page
    .getByLabel("Nome da nova família", { exact: true })
    .fill("Família Acesso");
  await page
    .getByLabel("Nome do responsável inicial (opcional)", { exact: true })
    .fill("Responsável Acesso");
  await page.getByLabel("PIN inicial (opcional)", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Criar família", exact: true })
    .click();
  await navigation(page, "Convidados");
  await page
    .getByRole("button", { name: "Editar Responsável Acesso", exact: true })
    .click();
  await page
    .getByLabel("WhatsApp do convidado", { exact: true })
    .fill("+55 (62) 99999-3478");
  await page
    .getByLabel("E-mail do convidado", { exact: true })
    .fill("responsavel@example.com");
  await page
    .getByLabel("Observações administrativas", { exact: true })
    .fill("Observação privada");
  await page
    .getByRole("button", { name: "Salvar / mover integrante", exact: true })
    .click();
  await navigation(page, "Famílias");
  const card = page
    .getByText("Família Acesso", { exact: true })
    .filter({ visible: true })
    .locator("..")
    .filter({
      has: page.getByRole("button", { name: "Salvar família", exact: true }),
    });
  await expect(card.getByLabel("PIN da família", { exact: true })).toHaveValue(
    "0047",
  );
  await expect(
    card.getByText(/Responsável: Responsável Acesso · WhatsApp: 5562999993478/),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Sugerir pelo WhatsApp", exact: true })
    .click();
  await expect(card.getByLabel("PIN da família", { exact: true })).toHaveValue(
    "3478",
  );
  await card.getByLabel("PIN da família", { exact: true }).fill("0123");
  await card.getByRole("button", { name: "Salvar PIN", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Gerar / regenerar link", exact: true }),
  ).toBeEnabled();
  await card
    .getByRole("button", { name: "Gerar / regenerar link", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Copiar link + PIN", exact: true })
    .click();
  await expect(
    card.getByText("Link e PIN copiados.", { exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(
    /^https:\/\/example\.test\/convite-felipe-e-lais\/c\/[a-f0-9]{48}\nPIN: 0123$/,
  );
  await card
    .getByRole("button", { name: "Gerar / regenerar link", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Copiar link do convite", exact: true })
    .click();
  await expect(card.getByText("Link copiado.", { exact: true })).toBeVisible();
  const rotated = await page.evaluate(() => navigator.clipboard.readText());
  expect(rotated).not.toBe(copied.split("\n")[0]);
  await card
    .getByRole("button", { name: "Revogar dispositivos", exact: true })
    .click();
  await expect(card.getByLabel("PIN da família", { exact: true })).toHaveValue(
    "0123",
  );
  await expect(
    card.getByRole("button", { name: "Copiar link + PIN", exact: true }),
  ).toBeVisible();
});
