import { test, expect, type Page } from "@playwright/test";
async function admin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
async function nav(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).click();
}
async function create(page: Page, name: string, phone = "") {
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  if (phone) await page.getByLabel("WhatsApp", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Abrir ficha de ${name}`, exact: true }),
  ).toBeVisible();
}
async function database(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("demo-db")!).snapshot,
  );
}
test("navigation and Choice selection remain visible and accessible", async ({
  page,
}) => {
  await admin(page);
  for (const [name, path] of [
    ["Painel", "/painel"],
    ["Famílias", "/familias"],
    ["Convidados", "/convidados"],
    ["Presentes", "/gestao-presentes"],
    ["Mensagens", "/gestao-mensagens"],
    ["Notificações", "/notificacoes"],
    ["Dia do evento", "/dia-do-evento"],
    ["Local", "/configuracao"],
    ["Minha conta", "/conta"],
  ]) {
    await nav(page, name!);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await page
        .getByRole("link", { name, exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(244, 237, 221)");
  }
  await nav(page, "Mensagens");
  const option = page.getByRole("radio", { name: "Todos", exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-checked", "true");
  expect(
    await option.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(244, 237, 221)");
});
test("standalone creation, child/group, contact mask, email validation, detail and edit", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await admin(page);
  await nav(page, "Convidados");
  await expect(page.getByLabel("Nome", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await expect(page.getByText("É adolescente?", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Acompanhante de", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Nome", { exact: true }).fill("José Victor");
  await page
    .getByLabel("Forma de tratamento", { exact: true })
    .selectOption("MALE");
  await page
    .getByRole("checkbox", { name: "Criança (até 10 anos)", exact: true })
    .click();
  await page
    .getByLabel("Grupo / vínculo", { exact: true })
    .selectOption({ label: "Convidado(a) do noivo" });
  await page
    .getByLabel("WhatsApp", { exact: true })
    .fill("+55 (62) 9 9999-0047");
  await expect(page.getByLabel("WhatsApp", { exact: true })).toHaveValue(
    "(62) 9 9999-0047",
  );
  await page.getByLabel("E-mail", { exact: true }).fill("bad-email");
  await page
    .getByLabel("Observações", { exact: true })
    .fill("Nota administrativa privada");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confira os campos");
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de José Victor",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByLabel("E-mail", { exact: true }).fill("jose@example.com");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de José Victor",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nota administrativa privada", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Possui observação administrativa", { exact: true }),
  ).toBeVisible();
  const db = await database(page),
    guest = db.guests.find((g: { name: string }) => g.name === "José Victor"),
    unit = db.invitations.find(
      (i: { id: string }) => i.id === guest.invitation_id,
    );
  expect(guest.salutation).toBe("MALE");
  expect(unit.kind).toBe("INDIVIDUAL");
  expect(unit.pin).toBe("0047");
  expect(unit.sharing_code).toMatch(/^[a-f0-9]{48}$/);
  expect(
    db.rsvps.find((r: { guest_id: string }) => r.guest_id === guest.id).status,
  ).toBe("PENDING");
  await page
    .getByRole("button", {
      name: "Copiar link do convite de José Victor",
      exact: true,
    })
    .click();
  await expect(page.getByText("Link copiado.", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`/c/${unit.sharing_code}`);
  expect(copied).not.toContain("0047");
  await page
    .getByRole("button", { name: "Abrir ficha de José Victor", exact: true })
    .click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("0047");
  await expect(
    page.getByText("Observações: Nota administrativa privada", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar convidado", exact: true })
    .click();
  await expect(
    page.getByLabel("Forma de tratamento", { exact: true }),
  ).toHaveValue("MALE");
  await page
    .getByLabel("Forma de tratamento", { exact: true })
    .selectOption("NEUTRAL");
  await page.getByLabel("Nome", { exact: true }).fill("José Editado");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de José Editado",
      exact: true,
    }),
  ).toBeVisible();
  const edited = await database(page);
  expect(
    edited.guests.find((g: { name: string }) => g.name === "José Editado")
      .salutation,
  ).toBe("NEUTRAL");
});
test("alphabetical list, exact filters, batch family association, detach and delete preserve guests", async ({
  page,
}) => {
  await admin(page);
  await nav(page, "Convidados");
  await create(page, "José Victor", "62999993478");
  await create(page, "Ágata");
  await create(page, "Bruno");
  const names = await page
    .getByRole("button", { name: /^Abrir ficha de / })
    .allTextContents();
  expect(names).toEqual(
    [...names].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    ),
  );
  await page
    .getByLabel("Filtrar convidados", { exact: true })
    .selectOption("PENDING");
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Convidado Um",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Filtrar convidados", { exact: true })
    .selectOption("ALL");
  await page
    .getByLabel("Buscar pessoa ou família", { exact: true })
    .fill("José");
  await expect(
    page.getByRole("button", { name: /^Abrir ficha de / }),
  ).toHaveCount(1);
  await page.getByLabel("Buscar pessoa ou família", { exact: true }).fill("");
  await nav(page, "Famílias");
  await page
    .getByRole("button", { name: "Adicionar família", exact: true })
    .click();
  await page
    .getByLabel("Nome da nova família", { exact: true })
    .fill("Guilherme e família");
  await page
    .getByLabel("Senha inicial (opcional)", { exact: true })
    .fill("1234");
  await page
    .getByRole("button", { name: "Criar família", exact: true })
    .click();
  await expect(page.getByLabel("Nome da família", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel("Senha da família", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Juntar famílias|Dividir família/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Editar família Guilherme e família",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Regenerar link", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fechar edição", exact: true })
    .click();
  await nav(page, "Convidados");
  await page
    .getByRole("checkbox", { name: "Selecionar José Victor", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Selecionar Ágata", exact: true })
    .click();
  await page
    .getByLabel("Família de destino", { exact: true })
    .selectOption({ label: "Guilherme e família" });
  await page
    .getByRole("button", { name: "Adicionar à família", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "dispositivos anteriores",
  );
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0);
  let db = await database(page);
  const family = db.invitations.find(
    (i: { name: string }) => i.name === "Guilherme e família",
  );
  expect(
    db.guests.filter(
      (g: { invitation_id: string }) => g.invitation_id === family.id,
    ),
  ).toHaveLength(2);
  await nav(page, "Famílias");
  await page
    .getByRole("button", {
      name: "Editar família Guilherme e família",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /^Membros \(/ }).click();
  await page
    .getByRole("button", {
      name: "Remover José Victor da família",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Remover José Victor da família",
      exact: true,
    }),
  ).toHaveCount(0);
  db = await database(page);
  const jose = db.guests.find(
    (g: { name: string }) => g.name === "José Victor",
  );
  expect(
    db.invitations.find((i: { id: string }) => i.id === jose.invitation_id),
  ).toMatchObject({ kind: "INDIVIDUAL", pin: "3478", active: true });
  await page
    .getByRole("button", { name: "Fechar edição", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Excluir família Guilherme e família",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar família Guilherme e família",
      exact: true,
    }),
  ).toHaveCount(0);
  db = await database(page);
  expect(db.guests.some((g: { name: string }) => g.name === "Ágata")).toBe(
    true,
  );
  expect(
    db.invitations.find((i: { id: string }) => i.id === family.id),
  ).toMatchObject({ active: false, link_active: false });
  await nav(page, "Convidados");
  await page
    .getByRole("checkbox", { name: "Selecionar José Victor", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Selecionar Ágata", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excluir selecionados", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de José Victor",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de José Victor",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir ficha de Ágata", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir ficha de Bruno", exact: true }),
  ).toBeVisible();
});
test("mobile selection has an explicit accessible alternative and remains responsive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page);
  await nav(page, "Convidados");
  await expect(
    page.getByRole("checkbox", { name: /^Selecionar / }),
  ).toHaveCount(0);
  const name = page.getByRole("button", {
    name: "Abrir ficha de Convidado Um",
    exact: true,
  });
  await name.hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(
    page.getByRole("checkbox", {
      name: "Selecionar Convidado Um",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Cancelar seleção", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir ficha de Convidado Um", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Selecionar convidado", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Selecionar Convidado Um",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Abrir ficha de Convidada Dois", exact: true })
    .click();
  await expect(
    page.getByText("2 selecionado(s)", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Cancelar seleção", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /^Selecionar / }),
  ).toHaveCount(0);
});
test("location saves separate GPS URL, rejects HTTP and hands the destination to Web Share", async ({
  page,
}) => {
  await admin(page);
  await nav(page, "Local");
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Editar local", exact: true }).click();
  await page
    .getByLabel("Nome do local", { exact: true })
    .fill("Villarejo Eventos");
  await page.getByLabel("Endereço", { exact: true }).fill("Rua do Evento, 12");
  await page
    .getByLabel("Link de GPS", { exact: true })
    .fill("http://unsafe.test");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Informe um link de GPS HTTPS válido.",
  );
  await page
    .getByLabel("Link de GPS", { exact: true })
    .fill("https://maps.test/evento");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("Alteração salva.", { exact: true }),
  ).toBeVisible();
  const db = await database(page);
  expect(db.event).toMatchObject({
    venue_name: "Villarejo Eventos",
    address: "Rua do Evento, 12",
    gps_url: "https://maps.test/evento",
  });
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Demo convidado", exact: true })
    .click();
  await nav(page, "Como chegar");
  await expect(
    page
      .getByRole("heading", { name: "Villarejo Eventos", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.context().route("https://maps.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Fixture destination</p>",
    }),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { sharedLocation: ShareData }).sharedLocation =
          data;
      },
    }),
  );
  await page
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { sharedLocation: ShareData }).sharedLocation,
    ),
  ).toEqual({
    title: "Local da celebração",
    text: "Rua do Evento, 12",
    url: "https://maps.test/evento",
  });
  await expect(
    page.getByRole("button", { name: "Abrir no Google Maps", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copiar endereço", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Waze",
    "Uber",
    "Abrir link de GPS",
    "Compartilhar com 99 / outros aplicativos",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  }
});

test("individual deletion is confirmed separately and a member pencil opens its edit form", async ({
  page,
}) => {
  await admin(page);
  await nav(page, "Convidados");
  await create(page, "Pessoa excluir");
  await page
    .getByRole("button", {
      name: "Excluir convidado Pessoa excluir",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de Pessoa excluir",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de Pessoa excluir",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Excluir convidado Pessoa excluir",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Abrir ficha de Pessoa excluir",
        exact: true,
        includeHidden: true,
      })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await nav(page, "Famílias");
  await page
    .getByRole("button", { name: "Editar família Família Demo", exact: true })
    .click();
  await page.getByRole("button", { name: /^Membros \(/ }).click();
  await page
    .getByRole("button", { name: "Editar convidado Convidado Um", exact: true })
    .click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(
    "Convidado Um",
  );
  await expect(page.getByLabel("Grupo / vínculo", { exact: true })).toHaveValue(
    "Demo",
  );
  await expect(page.getByLabel("Família", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(
    (await database(page)).guests.find(
      (g: { name: string }) => g.name === "Convidado Um",
    ).group_label,
  ).toBe("Demo");
});
