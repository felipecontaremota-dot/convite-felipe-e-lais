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
  await navigation(page, "Mensagens");
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
      "Configure o Supabase ou use o modo demo de desenvolvimento.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Seu convite", { exact: true })).toBeVisible();
  expect(page.url()).toContain("/c/");
});
