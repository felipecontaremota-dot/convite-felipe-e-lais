import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres(),
  event = "00000000-0000-4000-8000-000000000001",
  admin = randomUUID();
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${admin}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN');`,
  );
});
test.afterAll(() => db.stop());
async function setup(
  page: Page,
  kind: "FAMILY" | "INDIVIDUAL",
  salutation = "MALE",
) {
  const action = (action: string, payload: object) =>
    db.rpc(admin, "admin_action", {
      p_event: event,
      p_action: action,
      p_payload: payload,
    });
  const names =
    kind === "FAMILY"
      ? ["Guilherme", "Membro Um", "Membro Dois", "Membro Três"]
      : [salutation === "FEMALE" ? "Laís" : "Guilherme"];
  const guests = names.map((name, i) =>
    action("GUEST_CREATE", {
      name,
      salutation: i === 0 ? salutation : "NEUTRAL",
      whatsapp: "62999434778",
    }),
  );
  let invitation = guests[0].invitation_id;
  if (kind === "FAMILY") {
    invitation = action("INVITATION_SAVE", {
      name: "Família convidada",
      pin: "1234",
    }).id;
    action("CODE_ROTATE", { id: invitation, version: 1 });
    action("FAMILY_ADD_MEMBERS", {
      target_id: invitation,
      target_version: 2,
      guests: guests.map((g) => ({
        id: g.id,
        version: 1,
        invitation_version: 1,
      })),
    });
    const version = JSON.parse(
      db.sql(`select version from invitations where id='${invitation}';`),
    );
    action("INVITATION_SAVE", {
      id: invitation,
      version,
      name: "Família convidada",
      active: true,
      primary_guest_id: guests[0].id,
    });
  }
  const uid = randomUUID();
  db.sql(
    `insert into auth.users(id,is_anonymous) values('${uid}',true);insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('${event}','${uid}','${invitation}',now());`,
  );
  const exp = Math.floor(Date.now() / 1000) + 3600,
    encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url"),
    user = {
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: true,
    };
  const session = {
    access_token: `${encode({ alg: "HS256" })}.${encode({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-guest-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
  await page.addInitScript((session) => {
    if (!localStorage.getItem("sb-127-auth-token"))
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, session);
  const state = {
    fail: false,
    legacySchema: false,
    loseResponse: false,
    gate: null as Promise<void> | null,
    calls: [] as { fn: string; args: Record<string, unknown> }[],
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    if (path === "/auth/v1/user") data = user;
    else if (path.startsWith("/auth/")) data = session;
    else if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").at(-1)!;
      state.calls.push({ fn, args });
      if (fn === "app_mutate" && args.p_type === "RSVP_UPDATE" && state.gate)
        await state.gate;
      if (fn === "app_mutate" && args.p_type === "RSVP_UPDATE" && state.fail) {
        status = 503;
        data = { message: "network" };
      } else
        try {
          data = db.rpc(uid, fn, args);
          if (fn === "app_snapshot" && state.legacySchema) {
            delete (data as Record<string, unknown>).current_guest_id;
            delete (data as Record<string, unknown>).family_credentials;
          }
          if (
            fn === "app_mutate" &&
            args.p_type === "RSVP_UPDATE" &&
            state.loseResponse
          ) {
            state.loseResponse = false;
            await route.abort("failed");
            return;
          }
        } catch {
          status = 400;
          data = { message: "unauthorized" };
        }
    }
    await route.fulfill({ status, json: data });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inicio");
  return { uid, guests, invitation, state };
}
async function nav(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const [gender, text] of [
  ["MALE", "Bem-vindo, Guilherme"],
  ["FEMALE", "Bem-vinda, Laís"],
  ["NEUTRAL", "Boas-vindas, Guilherme"],
]) {
  test(`individual: ${gender}, RSVP editável, convite independente e reload`, async ({
    page,
  }) => {
    const { guests, state } = await setup(page, "INDIVIDUAL", gender);
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Sua presença ainda não foi confirmada", { exact: true }),
    ).toBeVisible();
    await nav(page, "Presença");
    await page.getByRole("radio", { name: "Irei", exact: true }).click();
    const person = gender === "FEMALE" ? "Laís" : "Guilherme";
    await page
      .getByRole("button", {
        name: `Confirmar presença de ${person}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Presença confirmada", { exact: true }),
    ).toBeVisible();
    for (const [choice, button, current] of [
      ["Não irei", `Confirmar ausência de ${person}`, "Ausência confirmada"],
      ["Ainda decidirei", "Confirmar que decidirei", "Ainda decidirei"],
      ["Irei", `Confirmar presença de ${person}`, "Presença confirmada"],
    ]) {
      await page
        .getByRole("button", { name: "Editar confirmação", exact: true })
        .click();
      await page.getByRole("radio", { name: choice, exact: true }).click();
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByText(current, { exact: true })).toBeVisible();
    }
    await nav(page, "Convites");
    await expect(
      page.getByRole("img", {
        name: `QR do convite individual de ${person}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Convite da família", { exact: true }),
    ).toHaveCount(0);
    if (gender === "MALE") {
      const oldHash = JSON.parse(
        db.sql(
          `select to_jsonb(token_hash) from qr_credentials where guest_id='${guests[0].id}' and revoked_at is null;`,
        ),
      );
      const before = state.calls.filter(
        (c) => c.fn === "issue_ticket" && c.args.p_regenerate === true,
      ).length;
      await page
        .getByRole("button", { name: "Gerar novo convite", exact: true })
        .click();
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      expect(
        state.calls.filter(
          (c) => c.fn === "issue_ticket" && c.args.p_regenerate === true,
        ),
      ).toHaveLength(before);
      await page
        .getByRole("button", { name: "Gerar novo convite", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await expect(
        page.getByText("Novo convite gerado.", { exact: true }),
      ).toBeVisible();
      const nextHash = JSON.parse(
        db.sql(
          `select to_jsonb(token_hash) from qr_credentials where guest_id='${guests[0].id}' and revoked_at is null;`,
        ),
      );
      expect(nextHash).not.toBe(oldHash);
      expect(nextHash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        state.calls.filter(
          (c) => c.fn === "issue_ticket" && c.args.p_regenerate === true,
        ),
      ).toHaveLength(before + 1);
    }
    await noOverflow(page);
    await page.reload();
    await expect(
      page.getByRole("img", {
        name: `QR do convite individual de ${person}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      JSON.parse(
        db.sql(`select count(*) from rsvps where guest_id='${guests[0].id}';`),
      ),
    ).toBe(1);
  });
}
test("família: identificação persistente, chefe e membros, modal e isolamento dos QRs", async ({
  page,
}) => {
  test.setTimeout(120000);
  const { state, invitation } = await setup(page, "FAMILY");
  await expect(
    page.getByText("Bem-vindos, Guilherme e família", { exact: true }),
  ).toBeVisible();
  await nav(page, "Convites");
  await expect(
    page.getByRole("img", { name: "QR do convite da família", exact: true }),
  ).toBeVisible();
  expect(state.calls.some((c) => c.fn === "identify_guest")).toBe(false);
  await nav(page, "Perfil");
  await page.getByRole("radio", { name: "Guilherme", exact: true }).click();
  await expect(
    page.getByText("Identificação salva neste aparelho.", { exact: true }),
  ).toBeVisible();
  await nav(page, "Convites");
  await expect(
    page.getByRole("img", { name: "QR do convite da família", exact: true }),
  ).toBeVisible();
  for (const name of ["Guilherme", "Membro Um", "Membro Dois", "Membro Três"])
    await expect(
      page.getByRole("img", {
        name: `QR do convite individual de ${name}`,
        exact: true,
      }),
    ).toBeVisible();
  await noOverflow(page);
  const before = state.calls.filter(
    (c) => c.fn === "issue_family_ticket",
  ).length;
  const family = page
    .getByText("Convite da família", { exact: true })
    .locator("..");
  await family
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.calls.filter((c) => c.fn === "issue_family_ticket").length).toBe(
    before,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await family
    .getByRole("button", { name: "Gerar novo convite", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText("Novo convite gerado.", { exact: true }),
  ).toBeVisible();
  expect(
    state.calls.filter(
      (c) => c.fn === "issue_family_ticket" && c.args.p_regenerate === true,
    ),
  ).toHaveLength(1);
  // Stress the same cards with a larger family and long names at the mobile viewport.
  for (let i = 0; i < 16; i++)
    db.sql(
      `insert into guests(event_id,invitation_id,name) values('${event}','${invitation}','Integrante adicional ${i} com um nome longo para conferir a quebra de texto no celular');`,
    );
  await page.reload();
  await expect(
    page.getByRole("img", { name: /^QR do convite individual de / }),
  ).toHaveCount(20);
  await noOverflow(page);
  await nav(page, "Perfil");
  await page.getByRole("radio", { name: "Membro Um", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Membro Um", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await nav(page, "Convites");
  await expect(
    page.getByRole("img", {
      name: "QR do convite individual de Membro Um",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR do convite da família", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "QR do convite individual de Guilherme",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", {
      name: "QR do convite individual de Membro Um",
      exact: true,
    }),
  ).toBeVisible();
  await noOverflow(page);
});
test("perfil: máscara, limite, opt-out/reativação e persistência real", async ({
  page,
}) => {
  const { guests } = await setup(page, "INDIVIDUAL");
  await nav(page, "Perfil");
  const phone = page.getByLabel("WhatsApp de Guilherme", { exact: true });
  await phone.fill("62999434778999999");
  await expect(phone).toHaveValue("(62) 9 9943-4778");
  await phone.fill("62999434778");
  await expect(phone).toHaveValue("(62) 9 9943-4778");
  await page
    .getByRole("checkbox", {
      name: "Revogar permissão de receber mensagens e notificações",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Salvar contato de Guilherme", exact: true })
    .click();
  await expect(
    page.getByText("Salvo com sucesso.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", {
      name: "Revogar permissão de receber mensagens e notificações",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(phone).toHaveValue("(62) 9 9943-4778");
  expect(
    JSON.parse(
      db.sql(
        `select jsonb_build_object('phone',whatsapp,'revoked',notifications_revoked,'email',consent_email) from guest_contacts where guest_id='${guests[0].id}';`,
      ),
    ),
  ).toEqual({ phone: "62999434778", revoked: true, email: false });
  await page
    .getByRole("checkbox", {
      name: "Revogar permissão de receber mensagens e notificações",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Salvar contato de Guilherme", exact: true })
    .click();
  await expect(
    page.getByText("Salvo com sucesso.", { exact: true }),
  ).toBeVisible();
  expect(
    JSON.parse(
      db.sql(
        `select to_jsonb(consent_email) from guest_contacts where guest_id='${guests[0].id}';`,
      ),
    ),
  ).toBe(true);
  await noOverflow(page);
});
test("RSVP: nenhum falso sucesso antes do commit ou após falha; reduced motion", async ({
  page,
}) => {
  const { state } = await setup(page, "INDIVIDUAL");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav(page, "Presença");
  await page.getByRole("radio", { name: "Irei", exact: true }).click();
  let release!: () => void;
  state.gate = new Promise<void>((r) => (release = r));
  await page
    .getByRole("button", {
      name: "Confirmar presença de Guilherme",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Que alegria saber/)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Confirmar presença de Guilherme",
      exact: true,
    }),
  ).toBeDisabled();
  release();
  state.gate = null;
  await expect(page.getByText(/Que alegria saber/)).toBeVisible();
  await page
    .getByRole("button", { name: "Editar confirmação", exact: true })
    .click();
  await page.getByRole("radio", { name: "Não irei", exact: true }).click();
  state.fail = true;
  await page
    .getByRole("button", {
      name: "Confirmar ausência de Guilherme",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Poxa/)).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Não irei", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("button", {
      name: "Confirmar ausência de Guilherme",
      exact: true,
    }),
  ).toBeEnabled();
  state.fail = false;
  await page
    .getByRole("button", {
      name: "Confirmar ausência de Guilherme",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Poxa/)).toBeVisible();
  await noOverflow(page);
});
test("localização: Web Share e fallback seguro, Google Maps e endereço separados", async ({
  page,
}) => {
  await setup(page, "INDIVIDUAL");
  db.sql(
    `update events set venue_name='Villarejo Eventos',address='Rua do evento, 123',gps_url='https://example.test/local' where id='${event}';`,
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { shared: ShareData }).shared = data;
      },
    });
  });
  await page.reload();
  await nav(page, "Como chegar");
  await page
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { shared: ShareData }).shared,
    ),
  ).toEqual({
    title: "Local da celebração",
    text: "Rua do evento, 123",
    url: "https://example.test/local",
  });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", { value: undefined }),
  );
  await page
    .getByRole("button", { name: "Abrir localização", exact: true })
    .click();
  await expect(
    page.getByText(
      "Localização copiada para abrir no aplicativo de sua preferência.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copiar endereço", exact: true })
    .click();
  await expect(
    page.getByText("Endereço copiado.", { exact: true }),
  ).toBeVisible();
  await page
    .context()
    .route("https://www.google.com/**", (route) =>
      route.fulfill({ body: "Maps fixture" }),
    );
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Abrir no Google Maps", exact: true })
    .click();
  await expect(await popup).toHaveURL(/google.com\/maps/);
  await noOverflow(page);
});

test("RSVP: resposta perdida após commit retoma o mesmo mutation_id sem duplicar ou revogar QR", async ({
  page,
}) => {
  const { guests, state } = await setup(page, "INDIVIDUAL");
  await nav(page, "Convites");
  await expect(
    page.getByRole("img", {
      name: "QR do convite individual de Guilherme",
      exact: true,
    }),
  ).toBeVisible();
  const original = db
    .sql(
      `select token_hash from qr_credentials where guest_id='${guests[0].id}' and revoked_at is null;`,
    )
    .trim();
  await nav(page, "Presença");
  state.loseResponse = true;
  await page
    .getByRole("radio", { name: "Ainda decidirei", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar que decidirei", exact: true })
    .click();
  await expect(
    page.getByText(
      "Salvo neste dispositivo. A sincronização falhou; tente novamente.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sincronizar agora", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sincronizar agora", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar confirmação", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        state.calls.filter(
          (c) => c.fn === "app_mutate" && c.args.p_type === "RSVP_UPDATE",
        ).length,
    )
    .toBeGreaterThanOrEqual(2);
  const sends = state.calls.filter(
    (c) => c.fn === "app_mutate" && c.args.p_type === "RSVP_UPDATE",
  );
  expect(new Set(sends.map((c) => c.args.p_mutation)).size).toBe(1);
  expect(
    db.sql(`select status from rsvps where guest_id='${guests[0].id}';`).trim(),
  ).toBe("MAYBE");
  expect(
    db
      .sql(`select count(*) from rsvps where guest_id='${guests[0].id}';`)
      .trim(),
  ).toBe("1");
  expect(
    db
      .sql(
        `select token_hash from qr_credentials where guest_id='${guests[0].id}' and revoked_at is null;`,
      )
      .trim(),
  ).toBe(original);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Editar confirmação", exact: true }),
  ).toBeVisible();
});
test("schema antigo: erro de implantação não enfileira novo RSVP online nem finge identificação local", async ({
  page,
}) => {
  const { state } = await setup(page, "FAMILY");
  state.legacySchema = true;
  await nav(page, "Presença");
  const card = page.getByText("Guilherme", { exact: true }).locator("..");
  await card
    .getByRole("radio", { name: "Ainda decidirei", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Confirmar que decidirei", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "O serviço de convidados precisa ser atualizado" }),
  ).toBeVisible();
  expect(state.calls.filter((c) => c.fn === "app_mutate")).toHaveLength(0);
  await nav(page, "Perfil");
  await page.getByRole("radio", { name: "Guilherme", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "O serviço de convidados precisa ser atualizado" }),
  ).toBeVisible();
  expect(state.calls.filter((c) => c.fn === "identify_guest")).toHaveLength(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("queue:"))
        .map((k) => JSON.parse(localStorage.getItem(k) || "[]"))
        .flat(),
    ),
  ).toEqual([]);
});
