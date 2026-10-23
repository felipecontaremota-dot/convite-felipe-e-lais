import { closeRsvpPresentation } from "./guest-presentation";
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
  await page.getByLabel("Senha de acesso", { exact: true }).fill("9999");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(
    page.getByText("Senha inválida.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Senha de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir convite", exact: true })
    .click();
  await expect(
    page.getByText("Bem-vindos, Convidado Um e família"),
  ).toBeVisible();
  await noOverflow(page);
  await navigation(page, "Presença");
  const second = page
    .getByText("Convidada Dois", { exact: true })
    .filter({ visible: true })
    .locator("..");
  await second
    .getByRole("button", {
      name: "Deixa eu fazer um suspense... 🕓",
      exact: true,
    })
    .click();
  await closeRsvpPresentation(page);
  // Each card owns its choice. Only the second person is updated.
  await second
    .getByRole("button", { name: "Editar minha confirmação", exact: true })
    .click();
  await second
    .getByRole("radio", {
      name: "Sim, eu vou, já tô com a roupa de ir",
      exact: true,
    })
    .click();
  await second
    .getByRole("button", { name: "Pode reservar meu lugar! 🎉", exact: true })
    .click();
  await closeRsvpPresentation(page);
  await navigation(page, "Convites");
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
  await expect(
    page.getByText("A lista será preparada pelos noivos em breve."),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Tenho interesse/ }),
  ).toHaveCount(0);
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
  await page
    .getByRole("button", {
      name: "Deixe uma mensagem para o casal",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Quem está enviando", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Que alegria participar!");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    page.getByText("Que alegria participar!", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await navigation(page, "Local");
  await expect(
    page.getByRole("button", { name: "Abrir localização", exact: true }),
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
    .getByRole("button", { name: "Adicionar família", exact: true })
    .click();
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
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Pessoa Nova Demo");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page
      .getByText("Pessoa Nova Demo", { exact: true })
      .filter({ visible: true })
      .last(),
  ).toBeVisible();
  await navigation(page, "Presentes");
  await page
    .getByRole("button", { name: "Adicionar lista", exact: true })
    .click();
  await page
    .getByLabel("Título da lista", { exact: true })
    .fill("Nova lista demo");
  await page
    .getByLabel("Link da lista", { exact: true })
    .fill("https://example.test/lista");
  await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
  await expect(
    page.getByText("Nova lista demo", { exact: true }),
  ).toBeVisible();
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
  await navigation(page, "Convites");
  await expect(
    page.getByRole("button", { name: "Emitir novo convite", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("demo-db")!).tickets[0].token as string,
  );
  await page.getByRole("button", { name: "Sair deste dispositivo" }).click();
  await start(page, "cerimonial");
  await page.getByRole("link", { name: "Dia do evento", exact: true }).click();
  await page
    .getByLabel("Token ou conteúdo do QR (entrada acessível)")
    .fill(`wedding://ticket/${token}`);
  await page
    .getByRole("button", { name: "Validar convite", exact: true })
    .click();
  await expect(
    page.getByText("1 / 1 presentes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Validar convite", exact: true })
    .click();
  await expect(
    page.getByText("Este convidado já teve sua entrada registrada.", {
      exact: true,
    }),
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
test("offline: consulta continua disponível sem inventar uma entrada persistida", async ({
  page,
  context,
}) => {
  await start(page, "cerimonial");
  await page.getByRole("link", { name: "Dia do evento", exact: true }).click();
  await context.setOffline(true);
  await expect(
    page
      .getByText(/Sem conexão/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Registrar entrada manualmente: Convidado Um",
      exact: true,
    })
    .click();
  const dialog = page.locator("[data-admin-modal]");
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    dialog.getByText(/Conecte-se para confirmar a entrada/),
  ).toBeVisible();
  await expect(
    page.getByText("0 / 1 presentes", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await context.setOffline(false);
  await expect(
    page.getByText("0 / 1 presentes", { exact: true }),
  ).toBeVisible();
});

test("uma sessão existente não autoriza um novo código inválido", async ({
  page,
}) => {
  await start(page);
  await page.goto("/c/CodigoInvalidoMesmoComSessaoExistente");
  await expect(
    page.getByText(
      "Não foi possível carregar o convite agora. Tente novamente.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Seu convite", { exact: true })).toBeVisible();
  expect(page.url()).toContain("/c/");
});

test("cadastro familiar: senha sugerida/customizada, copiar e regenerar link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page, "noivos");
  await navigation(page, "Convidados");
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Responsável Acesso");
  await page
    .getByLabel("WhatsApp", { exact: true })
    .fill("+55 (62) 99999-3478");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("responsavel@example.com");
  await page
    .getByLabel("Observações", { exact: true })
    .fill("Observação privada");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await navigation(page, "Famílias");
  await page
    .getByRole("button", { name: "Adicionar família", exact: true })
    .click();
  await page
    .getByLabel("Nome da nova família", { exact: true })
    .fill("Família Acesso");
  await page
    .getByLabel("Senha inicial (opcional)", { exact: true })
    .fill("0047");
  await page
    .getByRole("button", { name: "Criar família", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar família Família Acesso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Regenerar link", exact: true })
    .click();
  await page.getByRole("button", { name: /^Membros \(0\)$/ }).click();
  await page
    .getByRole("button", { name: "Adicionar membro à família", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Responsável Acesso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar membros", exact: true })
    .click();
  await page
    .getByLabel("Responsável", { exact: true })
    .selectOption({ label: "Responsável Acesso" });
  await page
    .getByRole("button", { name: "Salvar família", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar família Família Acesso", exact: true })
    .click();
  await expect(
    page.getByLabel("Senha da família", { exact: true }),
  ).toHaveValue("0047");
  await expect(
    page.getByText(
      /Responsável: Responsável Acesso · WhatsApp: \(62\) 9 9999-3478/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sugerir senha pelo WhatsApp", exact: true })
    .click();
  await expect(
    page.getByLabel("Senha da família", { exact: true }),
  ).toHaveValue("3478");
  await page.getByLabel("Senha da família", { exact: true }).fill("0123");
  await page.getByRole("button", { name: "Salvar senha", exact: true }).click();
  await page
    .getByRole("button", { name: "Regenerar link", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copiar link + senha", exact: true })
    .click();
  await expect(
    page.getByText("Link e senha copiados.", { exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(
    /^https:\/\/example\.test\/convite-felipe-e-lais\/c\/[a-f0-9]{48}\nSenha: 0123$/,
  );
  await page
    .getByRole("button", { name: "Regenerar link", exact: true })
    .click();
  await page.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(page.getByText("Link copiado.", { exact: true })).toBeVisible();
  const rotated = await page.evaluate(() => navigator.clipboard.readText());
  expect(rotated).not.toBe(copied.split("\n")[0]);
  expect(rotated).not.toContain("0123");
  await page
    .getByRole("button", { name: "Revogar dispositivos", exact: true })
    .click();
  await expect(
    page.getByLabel("Senha da família", { exact: true }),
  ).toHaveValue("0123");
  await expect(
    page.getByRole("button", { name: "Copiar link + senha", exact: true }),
  ).toBeVisible();
});
