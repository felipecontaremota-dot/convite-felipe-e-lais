import { test, expect, type Page } from "@playwright/test";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres();
const event = "00000000-0000-4000-8000-000000000001";
const uid = "abababab-0000-4000-8000-000000000001";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start(
    process.env.MESSAGING_TEST_BASELINE === "profile"
      ? "prod-profile"
      : "pre-confirmation",
  );
  db.sql(
    `insert into auth.users(id) values('${uid}'); insert into user_roles(event_id,user_id,role) values('${event}','${uid}','ADMIN');`,
  );
});
test.afterAll(() => db.stop());
async function backend(page: Page, actor = uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: actor,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    is_anonymous: actor !== uid,
  };
  const calls: { action: string; payload: Record<string, unknown> }[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const url = new URL(route.request().url()),
      args = route.request().postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    if (url.pathname === "/auth/v1/token")
      data = {
        access_token: `${encode({ alg: "HS256" })}.${encode({ sub: actor, exp, role: "authenticated" })}.fixture`,
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      };
    else if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname.startsWith("/rest/v1/rpc/")) {
      try {
        if (args.p_action)
          calls.push({ action: args.p_action, payload: args.p_payload });
        data = db.rpc(actor, url.pathname.split("/").at(-1)!, args);
      } catch (error) {
        status = 400;
        const stderr = String((error as { stderr?: string }).stderr || "");
        const known = stderr.match(
          /ERROR:\s+(conflict|not found|invalid family)\b/,
        );
        data = {
          code: "P0001",
          message: known?.[1] || "Fixture database operation failed",
        };
      }
    }
    await route.fulfill({ status, json: data });
  });
  return calls;
}
test("real RPC: remove member and delete family preserve guests; direct deletion stays separate", async ({
  page,
}) => {
  test.setTimeout(120000);
  const admin = (action: string, payload: Record<string, unknown>) =>
    db.rpc(uid, "admin_action", {
      p_event: event,
      p_action: action,
      p_payload: payload,
    });
  const a = admin("GUEST_CREATE", {
    name: "Membro preservado",
    whatsapp: "62999990047",
    email: "membro@example.test",
    admin_notes: "Manter observação",
  });
  const b = admin("GUEST_CREATE", { name: "Segundo preservado" });
  const family = admin("INVITATION_SAVE", {
    name: "Família regressão",
    pin: "1234",
  });
  admin("CODE_ROTATE", { id: family.id, version: 1 });
  admin("FAMILY_ADD_MEMBERS", {
    target_id: family.id,
    target_version: 2,
    guests: [
      { id: a.id, version: 1, invitation_version: 1 },
      { id: b.id, version: 1, invitation_version: 1 },
    ],
  });
  db.rpc(uid, "app_mutate", {
    p_event: event,
    p_mutation: "abababab-1000-4000-8000-000000000001",
    p_type: "RSVP_UPDATE",
    p_payload: { guest_id: a.id, status: "CONFIRMED", note: "Manter RSVP" },
  });
  const calls = await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Famílias", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Editar família Família regressão",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Membros (2)", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Remover Membro preservado da família",
      exact: true,
    })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Confirmação",
    exact: true,
  });
  await expect(confirm).toContainText(
    "Ele continuará cadastrado na lista de convidados e receberá acesso individual.",
  );
  await confirm.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Remover Membro preservado da família",
      exact: true,
    }),
  ).toHaveCount(0);
  let snapshot = db.rpc(uid, "app_snapshot", { p_event: event });
  const guest = snapshot.guests.find((g: { id: string }) => g.id === a.id);
  expect(
    snapshot.invitations.find(
      (i: { id: string }) => i.id === guest.invitation_id,
    ),
  ).toMatchObject({ kind: "INDIVIDUAL", pin: "0047", link_active: true });
  expect(
    snapshot.rsvps.find((r: { guest_id: string }) => r.guest_id === a.id),
  ).toMatchObject({ status: "CONFIRMED", note: "Manter RSVP" });
  expect(
    snapshot.contacts.find((c: { guest_id: string }) => c.guest_id === a.id),
  ).toMatchObject({ whatsapp: "62999990047", email: "membro@example.test" });
  expect(guest.admin_notes).toBe("Manter observação");
  await page
    .getByRole("button", { name: "Fechar edição", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Excluir família Família regressão",
      exact: true,
    })
    .click();
  await expect(confirm).toContainText(
    "Tem certeza que deseja excluir esta família? Seus membros serão preservados na lista de convidados.",
  );
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar família Família regressão",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Excluir família Família regressão",
      exact: true,
    })
    .click();
  await confirm.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar família Família regressão",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Membro preservado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Segundo preservado",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Selecionar Segundo preservado",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Excluir convidado Membro preservado",
      exact: true,
    })
    .click();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("1 selecionado(s)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Selecionar Membro preservado",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("button", {
      name: "Excluir convidado Membro preservado",
      exact: true,
    })
    .click();
  await confirm.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Membro preservado",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: "Selecionar Segundo preservado",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  snapshot = db.rpc(uid, "app_snapshot", { p_event: event });
  expect(snapshot.guests.some((g: { id: string }) => g.id === a.id)).toBe(
    false,
  );
  expect(snapshot.guests.some((g: { id: string }) => g.id === b.id)).toBe(true);
  expect(
    calls
      .filter((c) =>
        ["GUEST_REMOVE_FROM_FAMILY", "FAMILY_DELETE", "GUEST_DELETE"].includes(
          c.action,
        ),
      )
      .map((c) => c.action),
  ).toEqual(["GUEST_REMOVE_FROM_FAMILY", "FAMILY_DELETE", "GUEST_DELETE"]);
});
test("real RPC: Pessoa selects across access units and stores only selected recipients", async ({
  page,
}) => {
  const a = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: { name: "Ágata destinatária" },
  });
  const b = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: { name: "Bruno destinatário" },
  });
  const c = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: { name: "Carlos não selecionado" },
  });
  await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("button", { name: "Mensagens", exact: true }).click();
  await page
    .getByRole("button", { name: "Envio para família ou pessoa", exact: true })
    .click();
  await page.getByRole("radio", { name: "Pessoa", exact: true }).click();
  await expect(
    page.getByLabel("Selecionar família", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Selecionar pessoa(s)", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Selecionar pessoa(s)",
    exact: true,
  });
  await picker
    .getByRole("checkbox", { name: "Ágata destinatária", exact: true })
    .click();
  await picker
    .getByRole("button", {
      name: "Remover seleção de Ágata destinatária",
      exact: true,
    })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: "Ágata destinatária", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await picker
    .getByRole("checkbox", { name: "Ágata destinatária", exact: true })
    .click();
  await picker
    .getByRole("checkbox", { name: "Bruno destinatário", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: "Ágata destinatária", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    picker.getByRole("checkbox", { name: "Bruno destinatário", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await picker
    .getByRole("checkbox", { name: "Ágata destinatária", exact: true })
    .click();
  await picker
    .getByRole("checkbox", { name: "Bruno destinatário", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Concluir seleção", exact: true })
    .click();
  await page
    .getByLabel("Mensagem dos noivos", { exact: true })
    .fill("Recado para duas pessoas");
  await page
    .getByRole("button", { name: "Enviar recado", exact: true })
    .click();
  await expect(
    page.getByText("Recado para duas pessoas", { exact: true }),
  ).toBeVisible();
  const snapshot = db.rpc(uid, "app_snapshot", { p_event: event });
  const message = snapshot.messages.find(
    (m: { content: string }) => m.content === "Recado para duas pessoas",
  );
  expect(new Set(message.recipient_guest_ids)).toEqual(new Set([a.id, b.id]));
  expect(message.recipient_guest_ids).not.toContain(c.id);
  expect(
    snapshot.announcements.some(
      (m: { content: string }) => m.content === "Recado para duas pessoas",
    ),
  ).toBe(false);
});
test("real RPC: local edit refreshes saved card and official Maps iframe immediately", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://www.google.com/maps/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Fixture map</body></html>",
    }),
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Local", exact: true }).click();
  await expect(page.getByLabel("Nome do local", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Editar local", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Editar local", exact: true });
  await modal
    .getByLabel("Nome do local", { exact: true })
    .fill("Espaço da celebração");
  await modal.getByLabel("Endereço", { exact: true }).fill("Rua São João, 12");
  await modal
    .getByLabel("Link de GPS", { exact: true })
    .fill("https://maps.test/local-salvo");
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Espaço da celebração", exact: true }),
  ).toBeVisible();
  const iframe = page.locator('iframe[title="Mapa do local da celebração"]');
  await expect(iframe).toBeVisible();
  const url = new URL((await iframe.getAttribute("src"))!);
  expect(url.origin).toBe("https://www.google.com");
  expect(url.pathname).toBe("/maps/embed/v1/place");
  expect(url.searchParams.get("key")).toBe("fixture-public-maps-key");
  expect(url.searchParams.get("q")).toBe(
    "Espaço da celebração, Rua São João, 12",
  );
  await page.context().route("https://maps.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Fixture destination</p>",
    }),
  );
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Abrir link de GPS", exact: true })
    .click();
  const destination = await popup;
  await expect(destination).toHaveURL("https://maps.test/local-salvo");
  await destination.close();
  await expect(
    page.getByRole("button", { name: "Abrir link de GPS", exact: true }),
  ).toHaveCount(1);
  expect(db.rpc(uid, "app_snapshot", { p_event: event }).event).toMatchObject({
    venue_name: "Espaço da celebração",
    address: "Rua São João, 12",
    gps_url: "https://maps.test/local-salvo",
  });
});
test("real conflict stays in confirmation; pending deletion blocks Escape and cancellation", async ({
  page,
}) => {
  const created = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: { name: "Pessoa concorrência" },
  });
  await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Excluir convidado Pessoa concorrência",
      exact: true,
    })
    .click();
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_UPDATE",
    p_payload: {
      id: created.id,
      version: 1,
      name: "Pessoa concorrência",
      admin_notes: "Alterada em outra sessão",
    },
  });
  const modal = page.getByRole("dialog", { name: "Confirmação", exact: true });
  await modal.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    modal.getByText(
      "Os dados foram alterados em outra sessão. Atualize e tente novamente.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(modal).toBeVisible();
  expect(
    db
      .rpc(uid, "app_snapshot", { p_event: event })
      .guests.some((g: { id: string }) => g.id === created.id),
  ).toBe(true);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  // A conflict requires refreshing; successful CRUD scenarios above never reload.
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Pessoa concorrência",
      exact: true,
    }),
  ).toBeVisible();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/rpc/admin_action", async (route) => {
    if (route.request().postDataJSON()?.p_action === "GUEST_DELETE") await gate;
    await route.fallback();
  });
  await page
    .getByRole("button", {
      name: "Excluir convidado Pessoa concorrência",
      exact: true,
    })
    .click();
  await modal.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(modal).toBeVisible();
  release();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Abrir ficha de Pessoa concorrência",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("uncertain invitation keeps request ID; explicit resend requires confirmation", async ({
  page,
}) => {
  const guest = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: {
      name: "Uncertain delivery guest",
      email: "uncertain@example.test",
    },
  });
  await backend(page);
  const requests: string[] = [];
  await page.route(
    "http://127.0.0.1:54321/functions/v1/send-invitations",
    async (route) => {
      const args = route.request().postDataJSON();
      requests.push(args.request_id);
      const pending = requests.length < 4;
      await route.fulfill({
        json: {
          complete: !pending,
          pending: pending ? 1 : 0,
          sent: pending ? 0 : 1,
          failed: 0,
          skipped: 0,
          results: [
            {
              guest_id: guest.id,
              status: pending ? "pending" : "sent",
              reason: pending
                ? requests.length === 3
                  ? "expired"
                  : "uncertain"
                : undefined,
            },
          ],
        },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Enviar convite para Uncertain delivery guest",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Não foi possível confirmar o resultado do envio. O sistema manterá esta operação para verificação sem reenviar um convite duplicado.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enviar todos os convites", exact: true })
    .click();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByText(
      "Há convites individuais com resultado não confirmado. Verifique essas operações antes de iniciar um envio em massa.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Enviar convite para Uncertain delivery guest",
      exact: true,
    })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toBe(requests[0]);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByText(
      "O resultado deste envio não pôde ser confirmado. Verifique o histórico antes de iniciar um novo envio.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests[2]).toBe(requests[0]);
  await page
    .getByRole("button", {
      name: "Iniciar novo envio após verificação",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "O resultado do envio anterior não pôde ser confirmado. Um novo envio pode fazer o convidado receber o convite novamente. Deseja continuar?",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(requests).toHaveLength(3);
  await page
    .getByRole("button", {
      name: "Iniciar novo envio após verificação",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Reenviar mesmo assim", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3]).not.toBe(requests[0]);
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
});

test("reload preserves uncertain family after canonical deletion; bulk override stays acknowledged", async ({
  page,
}) => {
  const oldRequest = "dededede-1000-4000-8000-000000000001";
  const guest = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: {
      name: "Bulk restore guest",
      email: "bulk-restore@example.test",
    },
  });
  const alias = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: {
      name: "Bulk restore alias",
      email: "bulk-restore@example.test",
    },
  });
  const family = db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "INVITATION_SAVE",
    p_payload: { name: "Bulk retry family", pin: "1234" },
  });
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "CODE_ROTATE",
    p_payload: { id: family.id, version: 1 },
  });
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "FAMILY_ADD_MEMBERS",
    p_payload: {
      target_id: family.id,
      target_version: 2,
      guests: [
        { id: guest.id, version: 1, invitation_version: 1 },
        { id: alias.id, version: 1, invitation_version: 1 },
      ],
    },
  });
  db.sql(`select prepare_invitation_batch('${event}','${oldRequest}');`);
  const canonical = JSON.parse(
    db.sql(
      `select jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version) from invitation_deliveries d join guests g on g.id=d.guest_id join invitations i on i.id=g.invitation_id where d.request_id='${oldRequest}' and d.invitation_id='${family.id}';`,
    ),
  );
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_DELETE",
    p_payload: { guests: [canonical] },
  });
  const survivorName =
    canonical.id === guest.id ? "Bulk restore alias" : "Bulk restore guest";
  expect(
    db
      .sql(
        `select count(*) from invitation_deliveries where request_id='${oldRequest}' and invitation_id='${family.id}' and status='pending';`,
      )
      .trim(),
  ).toBe("1");
  await backend(page);
  const calls: {
    request_id: string;
    guest_id?: string;
    supersedes_request_id?: string;
  }[] = [];
  await page.route(
    "http://127.0.0.1:54321/functions/v1/send-invitations",
    async (route) => {
      const args = route.request().postDataJSON();
      calls.push(args);
      if (args.supersedes_request_id) {
        db.sql(
          `select prepare_invitation_resend('${event}','${args.supersedes_request_id}','${args.request_id}',null);`,
        );
      }
      const pending = calls.length < 3;
      if (!pending)
        db.sql(
          `update invitation_deliveries set status='sent',sent_at=now() where event_id='${event}' and request_id='${args.request_id}';`,
        );
      await route.fulfill({
        json: {
          pending: pending ? 1 : 0,
          sent: pending ? 0 : 1,
          failed: 0,
          skipped: 0,
          results: [
            {
              guest_id: guest.id,
              status: pending ? "pending" : "sent",
              reason: pending ? "uncertain" : undefined,
            },
          ],
        },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Envio em massa: resultado não confirmado.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Enviar convite para ${survivorName}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Há um envio em massa com resultado não confirmado. Use Tentar novamente nessa operação antes de iniciar um envio individual.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual(expect.objectContaining({ request_id: oldRequest }));
  expect(calls[0].guest_id).toBeUndefined();
  await page
    .getByRole("button", {
      name: "Iniciar novo envio após verificação",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Reenviar mesmo assim", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(2);
  const replacement = calls[1].request_id;
  expect(replacement).not.toBe(oldRequest);
  expect(calls[1].supersedes_request_id).toBe(oldRequest);
  expect(calls[1].guest_id).toBeUndefined();
  await expect
    .poll(() =>
      db
        .sql(
          `select bool_and(superseded_by='${replacement}'::uuid) from invitation_deliveries where request_id='${oldRequest}';`,
        )
        .trim(),
    )
    .toBe("t");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(3);
  expect(calls[2].request_id).toBe(replacement);
  expect(calls[2].guest_id).toBeUndefined();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `Enviar convite para ${survivorName}`,
      exact: true,
    })
    .click();
  await expect.poll(() => calls.length).toBe(4);
  expect(calls[3].request_id).not.toBe(oldRequest);
  expect(calls[3].request_id).not.toBe(replacement);
});

test("surviving family alias confirms individual resend directly without retrying the deleted recipient", async ({
  page,
}) => {
  const admin = (action: string, payload: Record<string, unknown>) =>
    db.rpc(uid, "admin_action", {
      p_event: event,
      p_action: action,
      p_payload: payload,
    });
  const a = admin("GUEST_CREATE", {
    name: "Individual canonical",
    email: "individual-alias@example.test",
  });
  const b = admin("GUEST_CREATE", {
    name: "Individual surviving alias",
    email: "individual-alias@example.test",
  });
  const family = admin("INVITATION_SAVE", {
    name: "Individual alias family",
    pin: "7612",
  });
  admin("CODE_ROTATE", { id: family.id, version: 1 });
  admin("FAMILY_ADD_MEMBERS", {
    target_id: family.id,
    target_version: 2,
    guests: [
      { id: a.id, version: 1, invitation_version: 1 },
      { id: b.id, version: 1, invitation_version: 1 },
    ],
  });
  const previous = "dfdfdfdf-1000-4000-8000-000000000001";
  const reservation = JSON.parse(
    db.sql(
      `select prepare_invitation_delivery('${event}','${previous}','${a.id}');`,
    ),
  );
  const claim = JSON.parse(
    db.sql(
      `select claim_invitation_delivery('${reservation.id}',repeat('a',64),'${reservation.credential_hash}');`,
    ),
  );
  db.sql(
    `select finish_invitation_delivery('${reservation.id}','pending','resend',null,'uncertain','${claim.token}');`,
  );
  const expected = JSON.parse(
    db.sql(
      `select jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version) from guests g join invitations i on i.id=g.invitation_id where g.id='${a.id}';`,
    ),
  );
  admin("GUEST_DELETE", { guests: [expected] });
  expect(
    db
      .sql(
        `select count(*) from invitation_delivery_members where request_id='${previous}' and guest_id='${b.id}';`,
      )
      .trim(),
  ).toBe("0");
  await backend(page);
  const calls: {
    request_id: string;
    supersedes_request_id?: string;
    guest_id: string;
  }[] = [];
  await page.route(
    "http://127.0.0.1:54321/functions/v1/send-invitations",
    async (route) => {
      const args = route.request().postDataJSON();
      calls.push(args);
      db.sql(
        `select prepare_invitation_resend('${event}','${args.supersedes_request_id}','${args.request_id}','${args.guest_id}');`,
      );
      db.sql(
        `update invitation_deliveries set status='sent',sent_at=now() where request_id='${args.request_id}';`,
      );
      await route.fulfill({
        json: {
          pending: 0,
          sent: 1,
          failed: 0,
          skipped: 0,
          results: [{ guest_id: b.id, status: "sent" }],
        },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText(
      "Convite de Individual surviving alias: resultado não confirmado.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Iniciar novo envio após verificação",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Reenviar mesmo assim", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual(
    expect.objectContaining({
      supersedes_request_id: previous,
      guest_id: b.id,
    }),
  );
  expect(calls[0].request_id).not.toBe(previous);
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
  expect(calls).toHaveLength(1);
});

test("guest form: shared save shortcut, validation, full-list duplicates and self editing with real RPC", async ({
  page,
}) => {
  const calls = await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  const name = page.getByLabel("Nome", { exact: true });
  const save = page.getByRole("button", { name: "Salvar", exact: true });
  const creations = () => calls.filter((c) => c.action === "GUEST_CREATE");
  const updates = () => calls.filter((c) => c.action === "GUEST_UPDATE");
  const open = () =>
    page
      .getByRole("button", { name: "Adicionar convidado", exact: true })
      .click();
  await open();
  await name.focus();
  await page.keyboard.press("Control+Enter");
  await expect(save).toBeDisabled();
  expect(creations()).toHaveLength(0);
  await name.fill("José da Silva Santos");
  await page.getByLabel("E-mail", { exact: true }).fill("invalid");
  await name.press("Control+Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Confira os campos informados e tente novamente.",
  );
  expect(creations()).toHaveLength(0);
  await page.getByLabel("E-mail", { exact: true }).fill("");
  await name.press("Enter");
  expect(creations()).toHaveLength(0);

  // Hold the real backend request to exercise two shortcuts during submission.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = async (route: import("@playwright/test").Route) => {
    if (route.request().postDataJSON()?.p_action === "GUEST_CREATE") await gate;
    await route.fallback();
  };
  await page.route("**/rpc/admin_action", hold);
  await name.press("Control+Enter");
  await expect(save).toBeDisabled();
  await name.press("Control+Enter");
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/rpc/admin_action", hold);
  expect(creations()).toHaveLength(1);
  const joseId = String(
    db.sql("select id from guests where name='José da Silva Santos'"),
  ).trim();
  expect(joseId).toMatch(/^[a-f0-9-]{36}$/);

  // Hide the original with BOTH search and an unrelated group filter.
  await page
    .getByLabel("Buscar pessoa ou família", { exact: true })
    .fill("inexistente");
  await page
    .getByLabel("Filtrar convidados", { exact: true })
    .selectOption("Familiar da noiva");
  for (const duplicate of [
    "José da Silva Santos",
    "josé da silva santos",
    " JOSÉ DA SILVA SANTOS ",
    "José   da   Silva   Santos",
  ]) {
    await open();
    await name.fill(duplicate);
    await expect(page.getByText(/Homônimos são permitidos/)).toBeVisible();
    await expect(save).toBeEnabled();
    expect(creations()).toHaveLength(1);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  expect(
    db
      .sql(
        "select count(*) from guests where lower(regexp_replace(trim(name),'\\s+',' ','g'))='josé da silva santos'",
      )
      .trim(),
  ).toBe("1");
  await page.getByLabel("Buscar pessoa ou família", { exact: true }).fill("");
  await page
    .getByLabel("Filtrar convidados", { exact: true })
    .selectOption("ALL");
  await open();
  await name.fill("Pessoa Botão Novo");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await open();
  await name.fill("Pessoa Cmd Novo");
  await name.press("Meta+Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(creations()).toHaveLength(3);
  await page
    .getByRole("button", {
      name: "Abrir ficha de José da Silva Santos",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Editar convidado", exact: true })
    .click();
  await page.getByLabel("WhatsApp", { exact: true }).fill("62999991234");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(updates()).toHaveLength(1);
  expect(
    db
      .sql(`select whatsapp from guest_contacts where guest_id='${joseId}'`)
      .trim(),
  ).toBe("62999991234");
  await page
    .getByRole("button", {
      name: "Abrir ficha de José da Silva Santos",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Editar convidado", exact: true })
    .click();
  await name.fill(" pessoa   botão novo ");
  await expect(page.getByText(/Homônimos são permitidos/)).toBeVisible();
  await name.press("Control+Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(updates()).toHaveLength(2);
  expect(db.sql(`select name from guests where id='${joseId}'`).trim()).toBe(
    "pessoa   botão novo",
  );
  expect(
    db
      .sql(
        "select count(*) from guests where lower(regexp_replace(trim(name),'\\s+',' ','g'))='pessoa botão novo'",
      )
      .trim(),
  ).toBe("2");
});

test("external gift lists persist, edit and delete through the real existing gift RPC", async ({
  page,
}) => {
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GIFT_SAVE",
    p_payload: {
      title: "Produto legado preservado",
      description: "Descrição antiga",
      external_url: "https://example.test/produto",
      image_url: null,
      price_label: "Valor antigo",
      active: true,
      sort_order: 1,
      reservation_enabled: true,
    },
  });
  const calls = await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("link", { name: "Presentes", exact: true }).click();
  const add = page.getByRole("button", {
    name: "Adicionar lista",
    exact: true,
  });
  const save = page.getByRole("button", { name: "Salvar lista", exact: true });
  await add.click();
  await page.getByLabel("Título da lista").fill("Lista real Havan");
  await page.getByLabel("Link da lista").fill("abc");
  await save.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Informe um título e um link HTTPS válido.",
  );
  expect(calls.filter((c) => c.action === "GIFT_SAVE")).toHaveLength(0);
  await page
    .getByLabel("Link da lista")
    .fill(
      "https://lista.havan.com.br/Convidado/ItensListaPresente/966559?aba=presentes",
    );
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await add.click();
  await page.getByLabel("Título da lista").fill("Segunda lista real");
  await page.getByLabel("Link da lista").fill("https://example.test/segunda");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    db
      .sql(
        "select count(*) from gifts where description='external-gift-list:v1'",
      )
      .trim(),
  ).toBe("2");
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: { name: "Convidado de teste das listas" },
  });
  const guestUid = "dededede-0000-4000-8000-000000000099";
  db.sql(`insert into auth.users(id) values('${guestUid}');
    insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at)
    select '${event}', '${guestUid}', i.id, now() from invitations i
    where i.event_id='${event}' and i.active and i.archived_at is null
      and exists(select 1 from guests g where g.invitation_id=i.id)
    limit 1;`);
  const guestSnapshot = db.rpc(guestUid, "app_snapshot", { p_event: event });
  expect(guestSnapshot.role).toBe("GUEST");
  expect(
    guestSnapshot.gifts.filter(
      (g: { description: string }) => g.description === "external-gift-list:v1",
    ),
  ).toHaveLength(2);
  await page.reload();
  await expect(
    page.getByText("Lista real Havan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Segunda lista real", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Editar lista Segunda lista real",
      exact: true,
    })
    .click();
  await page.getByLabel("Título da lista").fill("Segunda lista real editada");
  await page.getByLabel("Link da lista").fill("https://example.test/editada");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    db
      .sql(
        "select external_url from gifts where title='Segunda lista real editada'",
      )
      .trim(),
  ).toBe("https://example.test/editada");
  await page
    .getByRole("button", {
      name: "Excluir lista Segunda lista real editada",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByText("Segunda lista real editada", { exact: true }),
  ).toHaveCount(0);
  expect(
    db
      .sql(
        "select count(*) from gifts where description='external-gift-list:v1'",
      )
      .trim(),
  ).toBe("1");
  expect(
    db
      .sql(
        "select count(*) from gifts where title='Produto legado preservado' and description='Descrição antiga' and price_label='Valor antigo' and reservation_enabled",
      )
      .trim(),
  ).toBe("1");
});

test("inline email waits for provider result, blocks double send and permits retry after failure", async ({
  page,
}) => {
  db.rpc(uid, "admin_action", {
    p_event: event,
    p_action: "GUEST_CREATE",
    p_payload: {
      name: "Inline email feedback",
      email: "inline@example.test",
    },
  });
  await backend(page);
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "http://127.0.0.1:54321/functions/v1/send-invitations",
    async (route) => {
      count++;
      if (count === 1) {
        await route.fulfill({
          status: 500,
          json: { error: "Provider unavailable" },
        });
        return;
      }
      await gate;
      await route.fulfill({
        json: { pending: 0, sent: 1, skipped: 0, failed: 0, results: [] },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Convidados", exact: true }).click();
  const send = page.getByRole("button", {
    name: "Enviar convite para Inline email feedback",
    exact: true,
  });
  await send.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(send).toBeEnabled();
  await expect(send.getByText("E-mail enviado", { exact: true })).toHaveCount(
    0,
  );
  await send.click();
  await expect(send).toHaveAttribute("aria-busy", "true");
  await expect(send).toBeDisabled();
  await send.dispatchEvent("click");
  await expect.poll(() => count).toBe(2);
  await expect(send.getByText("E-mail enviado", { exact: true })).toHaveCount(
    0,
  );
  release();
  await expect(send.getByText("E-mail enviado", { exact: true })).toBeVisible();
  expect(count).toBe(2);
  await expect(page.locator(".fx-toast")).toHaveCount(0);
  await expect(send).toBeEnabled();
});

test("real persisted chat: automatic unit identity, private replies, general send and scoped deletion survive reload", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const guestA = "abababab-3000-4000-8000-000000000001",
    guestB = "abababab-3000-4000-8000-000000000002";
  const create = (name: string) =>
    db.rpc(uid, "admin_action", {
      p_event: event,
      p_action: "GUEST_CREATE",
      p_payload: { name },
    });
  const a = create("Unidade conversa persistente"),
    b = create("Outra unidade privada");
  db.sql(
    `insert into auth.users(id,is_anonymous) values('${guestA}',true),('${guestB}',true);insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('${event}','${guestA}','${a.invitation_id}',now()),('${event}','${guestB}','${b.invitation_id}',now());`,
  );
  db.rpc(guestB, "app_mutate", {
    p_event: event,
    p_mutation: "abababab-4000-4000-8000-000000000001",
    p_type: "MESSAGE_SEND",
    p_payload: { content: "Segredo da outra unidade" },
  });
  const guestContext = await browser.newContext({
      baseURL: "http://127.0.0.1:8083",
    }),
    guest = await guestContext.newPage();
  await backend(guest, guestA);
  await guest.addInitScript((actor) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const enc = (v: unknown) =>
      btoa(JSON.stringify(v))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: `${enc({ alg: "HS256" })}.${enc({ sub: actor, role: "authenticated", exp })}.fixture`,
        refresh_token: "fixture-refresh",
        expires_at: exp,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: actor,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
        },
      }),
    );
  }, guestA);
  await guest.goto("/inicio");
  await guest
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  const guestChat = guest.getByRole("dialog", {
    name: "Mensagens com Felipe & Laís",
    exact: true,
  });
  await guestChat
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Pergunta realmente persistida");
  await guestChat
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    guestChat.getByText("Pergunta realmente persistida", { exact: true }),
  ).toBeVisible();
  const inbound = JSON.parse(
    db
      .sql(
        "select row_to_json(m) from messages m where content='Pergunta realmente persistida';",
      )
      .trim(),
  );
  expect(inbound.invitation_id).toBe(a.invitation_id);
  expect(inbound.sender_guest_id).toBeNull();
  await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  const initialUrl = page.url();
  await page.getByRole("button", { name: /^Mensagens dos convidados/ }).click();
  const center = page.getByRole("dialog", {
    name: "Mensagens dos convidados",
    exact: true,
  });
  await expect(
    center.getByRole("button", { name: /^Unidade conversa persistente/ }),
  ).toBeVisible();
  expect(
    db
      .sql(
        `select count(*) from message_reads where message_id='${inbound.id}';`,
      )
      .trim(),
  ).toBe("0");
  await center
    .getByRole("button", { name: /^Unidade conversa persistente/ })
    .click();
  const chat = page.getByRole("dialog", {
    name: "Unidade conversa persistente",
    exact: true,
  });
  await chat
    .getByLabel("Resposta dos noivos", { exact: true })
    .fill("Resposta realmente persistida");
  await chat
    .getByRole("button", { name: "Enviar resposta", exact: true })
    .click();
  await expect(
    chat.getByText("Resposta realmente persistida", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(initialUrl);
  const reply = JSON.parse(
    db
      .sql(
        "select row_to_json(m) from messages m where content='Resposta realmente persistida';",
      )
      .trim(),
  );
  expect(reply.invitation_id).toBe(a.invitation_id);
  expect(reply.audience).toBe("PRIVATE");
  expect(
    JSON.stringify(db.rpc(guestB, "app_snapshot", { p_event: event })),
  ).not.toContain("Resposta realmente persistida");
  await guest.reload();
  await guest
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  await expect(
    guestChat.getByText("Resposta realmente persistida", { exact: true }),
  ).toBeVisible();
  await expect(
    guestChat.getByText("Segredo da outra unidade", { exact: true }),
  ).toHaveCount(0);
  await chat
    .getByRole("button", { name: "Voltar às conversas", exact: true })
    .click();
  await center
    .getByRole("button", { name: "Enviar mensagem para todos", exact: true })
    .click();
  const general = page.getByRole("dialog", {
    name: "Mensagens para todos",
    exact: true,
  });
  await general
    .getByLabel("Mensagem para todos", { exact: true })
    .fill("Aviso geral persistido");
  await general
    .getByRole("button", { name: "Enviar mensagem para todos", exact: true })
    .click();
  await expect(
    general.getByText("Aviso geral persistido", { exact: true }),
  ).toBeVisible();
  const broadcast = JSON.parse(
    db
      .sql(
        "select row_to_json(m) from messages m where content='Aviso geral persistido';",
      )
      .trim(),
  );
  expect(broadcast.audience).toBe("GENERAL");
  await guest.reload();
  await guest
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  await expect(
    guestChat.getByText("Aviso geral persistido", { exact: true }),
  ).toBeVisible();
  await guestChat
    .getByLabel("Mensagem aos noivos", { exact: true })
    .fill("Resposta particular ao aviso geral");
  await guestChat
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(
    guestChat.getByText("Resposta particular ao aviso geral", { exact: true }),
  ).toBeVisible();
  expect(
    JSON.stringify(db.rpc(guestB, "app_snapshot", { p_event: event })),
  ).not.toContain("Resposta particular ao aviso geral");
  const deleteEndpoint = "http://127.0.0.1:54321/rest/v1/rpc/admin_action";
  await page.route(deleteEndpoint, async (route) => {
    const args = route.request().postDataJSON();
    if (args.p_action === "MESSAGE_DELETE")
      await route.fulfill({
        status: 400,
        json: {
          code: "P0001",
          message: "legacy announcement needs association",
        },
      });
    else await route.fallback();
  });
  await general
    .getByText("Aviso geral persistido", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Excluir mensagem", exact: true })
    .click();
  const rejected = page.getByRole("dialog", {
    name: "Excluir mensagem?",
    exact: true,
  });
  await rejected.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    rejected.getByText(
      /exclusão foi bloqueada para preservar outras mensagens/,
    ),
  ).toBeVisible();
  expect(
    db
      .sql(
        `select deleted_at is null from messages where id='${broadcast.id}';`,
      )
      .trim(),
  ).toBe("t");
  await rejected.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.unroute(deleteEndpoint);
  await general
    .getByText("Aviso geral persistido", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Excluir mensagem", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir mensagem?", exact: true })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(
    general.getByText("Aviso geral persistido", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^Mensagens dos convidados/ }).click();
  await center
    .getByRole("button", { name: /^Unidade conversa persistente/ })
    .click();
  await expect(
    chat.getByText("Resposta realmente persistida", { exact: true }),
  ).toBeVisible();
  await chat
    .getByText("Resposta realmente persistida", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Excluir mensagem", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir mensagem?", exact: true })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(
    chat.getByText("Resposta realmente persistida", { exact: true }),
  ).toHaveCount(0);
  await guest.reload();
  await guest
    .getByRole("button", { name: /Deixe uma mensagem para o casal/ })
    .click();
  await expect(
    guestChat.getByText("Resposta realmente persistida", { exact: true }),
  ).toHaveCount(0);
  await expect(
    guestChat.getByText("Aviso geral persistido", { exact: true }),
  ).toHaveCount(0);
  await expect(
    guestChat.getByText("Pergunta realmente persistida", { exact: true }),
  ).toBeVisible();
  expect(
    db
      .sql(
        `select deleted_at is not null from messages where id='${reply.id}';`,
      )
      .trim(),
  ).toBe("t");
  await guestContext.close();
});
