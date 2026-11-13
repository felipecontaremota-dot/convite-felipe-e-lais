import { test, expect, type Page } from "@playwright/test";
import { colors } from "../../src/theme/palette";
const selectionBackground = `rgb(${colors.wash
  .slice(1)
  .match(/../g)!
  .map((part) => parseInt(part, 16))
  .join(", ")})`;
async function admin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo noivos", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}
async function nav(page: Page, name: string) {
  await page
    .getByRole(name === "Mensagens" ? "button" : "link", { name, exact: true })
    .click();
  if (name === "Mensagens")
    await page
      .getByRole("button", {
        name: "Envio para família ou pessoa",
        exact: true,
      })
      .click();
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
    await expect(
      page.getByRole(name === "Mensagens" ? "button" : "link", {
        name,
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page
        .getByRole(name === "Mensagens" ? "button" : "link", {
          name,
          exact: true,
        })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(selectionBackground);
  }
  await nav(page, "Mensagens");
  const option = page.getByRole("radio", { name: "Todos", exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-checked", "true");
  expect(
    await option.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(selectionBackground);
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
  await expect(
    page.getByLabel("Gênero", { exact: true }).locator("option"),
  ).toHaveText(["Selecione", "Masculino", "Feminino"]);
  await page.getByLabel("Gênero", { exact: true }).selectOption("MASCULINE");
  await page
    .getByRole("checkbox", { name: "Criança (até 7 anos)", exact: true })
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
    page.getByRole("button", {
      name: "Observação de José Victor",
      exact: true,
    }),
  ).toBeVisible();
  const db = await database(page),
    guest = db.guests.find((g: { name: string }) => g.name === "José Victor"),
    unit = db.invitations.find(
      (i: { id: string }) => i.id === guest.invitation_id,
    );
  expect(unit.kind).toBe("INDIVIDUAL");
  expect(guest.greeting_form).toBe("MASCULINE");
  expect(guest.is_child).toBe(true);
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
  await expect(page.getByText("Link copiado", { exact: true })).toBeVisible();
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
    page.getByRole("checkbox", { name: "Criança (até 7 anos)", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Nome", { exact: true }).fill("José Editado");
  await expect(page.getByLabel("Gênero", { exact: true })).toHaveValue(
    "MASCULINE",
  );
  await page.getByLabel("Gênero", { exact: true }).selectOption("FEMININE");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(
    (await database(page)).guests.find((g: { id: string }) => g.id === guest.id)
      .is_child,
  ).toBe(true);
  expect(
    (await database(page)).guests.find((g: { id: string }) => g.id === guest.id)
      .greeting_form,
  ).toBe("FEMININE");
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de José Editado",
      exact: true,
    }),
  ).toBeVisible();
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
test("location saves separate GPS URL, rejects HTTP and opens direct external destination", async ({
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
  await expect(page.getByText("Local salvo", { exact: true })).toBeVisible();
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
  await nav(page, "Local");
  await expect(
    page
      .getByRole("heading", { name: "Villarejo Eventos", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  for (const name of ["Google Maps", "Waze", "Uber", "99"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of [
    "Abrir no Apple Maps",
    "Abrir link de localização configurado",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Abrir localização", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copiar endereço", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Rua do Evento, 12", { exact: true }),
  ).toHaveCount(1);
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

test("new seven-year guidance preserves previously classified children on load and edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page);
  // Historical classifications in a disposable demo fixture only. The actual
  // model stores is_child, not chronological ages or dates of birth.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    db.snapshot.guests.forEach(
      (g: { name: string; is_child: boolean }, i: number) => {
        g.name = `Criança legada de ${8 + i} anos`;
        g.is_child = true;
      },
    );
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  const before = await database(page);
  await page.reload();
  await nav(page, "Convidados");
  await expect(page.getByText("Criança", { exact: true })).toHaveCount(3);
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Criança (até 7 anos)", exact: true }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Abrir ficha de Criança legada de 8 anos",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Criança \(até 7 anos\)/)).toBeVisible();
  expect(await database(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Editar convidado", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Criança (até 7 anos)", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar convidado", exact: true }),
  ).toHaveCount(0);
  const after = await database(page);
  expect(after.guests.map((g: { is_child: boolean }) => g.is_child)).toEqual([
    true,
    true,
    true,
  ]);
  expect(after.rsvps).toEqual(before.rsvps);
  expect(after.invitations).toEqual(
    before.invitations.map((i: { id: string; version: number }) => ({
      ...i,
      version: i.version + (i.id === before.guests[0].invitation_id ? 1 : 0),
    })),
  );
  expect(after.guests.slice(1)).toEqual(before.guests.slice(1));
});

test("party filters use active promotions, ordered options and the existing name/family search", async ({
  page,
}) => {
  await admin(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("demo-db")!);
    const [father, mother, common] = db.snapshot.guests;
    father.name = "João Oliveira";
    father.greeting_form = "FEMININE";
    mother.name = "Maria Oliveira";
    mother.greeting_form = "MASCULINE";
    common.name = "João Comum";
    db.weddingParty = [
      { guest_id: father.id, active: true, role: "PADRINHO" },
      { guest_id: mother.id, active: true, role: "MADRINHA" },
      { guest_id: common.id, active: false, role: "PADRINHO" },
    ];
    localStorage.setItem("demo-db", JSON.stringify(db));
  });
  const before = await database(page);
  await page.reload();
  await nav(page, "Convidados");
  const filter = page.getByLabel("Filtrar convidados", { exact: true });
  await expect(filter.locator("option")).toHaveText([
    "Todos",
    "Familiar da noiva",
    "Familiar do noivo",
    "Convidado(a) da noiva",
    "Convidado(a) do noivo",
    "Padrinhos",
    "Madrinhas",
    "Padrinhos e madrinhas",
    "Confirmados",
    "Não irão",
    "Pendentes",
    "Talvez",
    "Convites enviados",
    "Convites não enviados",
  ]);
  const rows = page.getByRole("button", { name: /^Abrir ficha de / });
  for (const [value, names] of [
    ["PADRINHO", ["João Oliveira"]],
    ["MADRINHA", ["Maria Oliveira"]],
    ["WEDDING_PARTY", ["João Oliveira", "Maria Oliveira"]],
  ] as [string, string[]][]) {
    await filter.selectOption(value);
    await expect(rows).toHaveText(names);
    await page
      .getByLabel("Buscar pessoa ou família", { exact: true })
      .fill("Família Demo");
    await expect(rows).toHaveText(names);
    await page
      .getByLabel("Buscar pessoa ou família", { exact: true })
      .fill(names[0]!.split(" ")[0]!);
    await expect(rows).toHaveText([names[0]!]);
    await page.getByLabel("Buscar pessoa ou família", { exact: true }).fill("");
  }
  await filter.selectOption("ALL");
  await expect(rows).toHaveText([
    "João Comum",
    "João Oliveira",
    "Maria Oliveira",
  ]);
  await page
    .getByRole("button", { name: "Adicionar convidado", exact: true })
    .click();
  await expect(
    page.getByLabel("Grupo / vínculo", { exact: true }).locator("option"),
  ).toHaveText([
    "Não se aplica",
    "Familiar da noiva",
    "Familiar do noivo",
    "Convidado(a) da noiva",
    "Convidado(a) do noivo",
  ]);
  await page.keyboard.press("Escape");
  expect(await database(page)).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await filter.selectOption("MADRINHA");
  await expect(rows).toHaveText(["Maria Oliveira"]);
});
