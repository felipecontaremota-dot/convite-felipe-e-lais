import { test, expect, type Page } from "@playwright/test";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres();
const event = "00000000-0000-4000-8000-000000000001";
const uid = "abababab-0000-4000-8000-000000000001";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${uid}'); insert into user_roles(event_id,user_id,role) values('${event}','${uid}','ADMIN');`,
  );
});
test.afterAll(() => db.stop());
async function backend(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    is_anonymous: false,
  };
  const calls: { action: string; payload: Record<string, unknown> }[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const url = new URL(route.request().url()),
      args = route.request().postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    if (url.pathname === "/auth/v1/token")
      data = {
        access_token: `${encode({ alg: "HS256" })}.${encode({ sub: uid, exp, role: "authenticated" })}.fixture`,
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
        data = db.rpc(uid, url.pathname.split("/").at(-1)!, args);
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
  await page.getByRole("link", { name: "Mensagens", exact: true }).click();
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
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  const destination = await popup;
  await expect(destination).toHaveURL("https://maps.test/local-salvo");
  await destination.close();
  await expect(
    page.getByRole("button", { name: "Abrir link de GPS", exact: true }),
  ).toHaveCount(0);
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

test("reload restores one bulk operation; explicit override remains acknowledged after another reload", async ({
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
  db.sql(`select prepare_invitation_batch('${event}','${oldRequest}');`);
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
      name: "Enviar convite para Bulk restore guest",
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
      name: "Enviar convite para Bulk restore guest",
      exact: true,
    })
    .click();
  await expect.poll(() => calls.length).toBe(4);
  expect(calls[3].request_id).not.toBe(oldRequest);
  expect(calls[3].request_id).not.toBe(replacement);
});
