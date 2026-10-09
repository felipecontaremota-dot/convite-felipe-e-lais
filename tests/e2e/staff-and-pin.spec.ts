import { test, expect, type Page } from "@playwright/test";
const code = "CodeSeguroNaoEnumeravelCom32Chars";
const event = "00000000-0000-4000-8000-000000000001";
const family = "10000000-0000-4000-8000-000000000001";
const uid = "aaaaaaaa-0000-4000-8000-000000000011";
async function backend(
  page: Page,
  role: "ADMIN" | "CEREMONIALIST" | null = "ADMIN",
) {
  const state = {
    role,
    bound: false,
    pin: "0047",
    active: true,
    attempts: 0,
    activations: 0,
    identified: 0,
    anonymous: false,
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = () => ({
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: state.anonymous ? undefined : "staff@example.com",
    is_anonymous: state.anonymous,
  });
  const session = () => ({
    access_token: `${encode({ alg: "HS256" })}.${encode({ sub: uid, exp, role: "authenticated", is_anonymous: state.anonymous })}.fixture`,
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: user(),
  });
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      body = req.postDataJSON() || {};
    let data: unknown = {},
      status = 200;
    if (url.pathname === "/auth/v1/token") {
      if (body.password === "incorrect") {
        status = 400;
        data = {
          message: "Invalid login credentials",
          code: "invalid_credentials",
        };
      } else {
        state.anonymous = false;
        data = session();
      }
    } else if (url.pathname === "/auth/v1/signup") {
      state.anonymous = true;
      data = session();
    } else if (url.pathname === "/auth/v1/user") data = user();
    else if (url.pathname === "/rest/v1/rpc/event_role") data = state.role;
    else if (url.pathname === "/rest/v1/rpc/app_snapshot") {
      const actualRole = state.anonymous
        ? state.bound
          ? "GUEST"
          : null
        : state.role;
      data = {
        role: actualRole,
        event: {
          id: event,
          title: "Felipe & Laís",
          starts_at: "2026-12-15T19:00:00Z",
          timezone: "America/Sao_Paulo",
          venue_name: null,
          address: null,
          latitude: null,
          longitude: null,
        },
        invitations: actualRole
          ? [
              {
                id: family,
                event_id: event,
                name: "Família Teste",
                active: true,
                primary_guest_id: null,
                version: 1,
              },
            ]
          : [],
        guests: actualRole
          ? [
              {
                id: "20000000-0000-4000-8000-000000000001",
                event_id: event,
                invitation_id: family,
                name: "Integrante Protegido",
                group_label: "",
                companion_of: null,
                version: 1,
              },
            ]
          : [],
        rsvps: [],
        contacts: [],
        gifts: [],
        gift_selections: [],
        messages: [],
        announcements: [],
        rules: [],
        credentials: [],
        checkins: [],
        notification_jobs: [],
        sheet_jobs: [],
      };
    } else if (url.pathname === "/functions/v1/redeem-invitation") {
      if (body.action === "identify") {
        state.identified++;
        if (state.active && body.code === code)
          data = { name: "Família Teste", activated: state.bound };
        else {
          status = 429;
          data = { error: "Código ou PIN inválido." };
        }
      } else {
        state.attempts++;
        if (
          state.active &&
          body.code === code &&
          body.pin === state.pin &&
          state.attempts <= 15
        ) {
          state.bound = true;
          state.activations++;
          data = { linked: true };
        } else {
          status = 429;
          data = { error: "Código ou PIN inválido." };
        }
      }
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST,GET,PUT,OPTIONS",
      },
      body: JSON.stringify(data),
    });
  });
  return state;
}
async function login(page: Page, password = "correct-password") {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("staff@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
test("ADMIN password login, persistent session, own password update", async ({
  page,
}) => {
  await backend(page);
  await login(page);
  await expect(page).toHaveURL(/\/painel$/);
  await page.reload();
  await expect(
    page.getByText("O nosso casamento, em cada detalhe", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Minha conta", exact: true }).click();
  await page.getByLabel("Nova senha", { exact: true }).fill("new-password-123");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("new-password-123");
  await page
    .getByRole("button", { name: "Salvar minha senha", exact: true })
    .click();
  await expect(
    page.getByText("Senha atualizada no Supabase Auth.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "new-password-123",
  );
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue("");
});
test("CEREMONIALIST password routes to check-in", async ({ page }) => {
  await backend(page, "CEREMONIALIST");
  await login(page);
  await expect(page).toHaveURL(/\/checkin$/);
  await expect(
    page.getByRole("heading", { name: "Check-in", exact: true }),
  ).toBeVisible();
});
test("wrong password and staff without role cannot enter", async ({ page }) => {
  await backend(page, null);
  await login(page, "incorrect");
  await expect(
    page.getByText("E-mail ou senha inválidos.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByText("Esta conta não tem acesso aos noivos ou ao cerimonial.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/painel");
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
});
test("family identification never activates; PIN 0047 activates once, session resumes and logout requires PIN", async ({
  page,
}) => {
  const state = await backend(page, null);
  await page.goto(`/c/${code}`);
  await expect(
    page.getByText("Olá, Família Teste!", { exact: true }),
  ).toBeVisible();
  expect(state.activations).toBe(0);
  await expect(
    page.getByText("Integrante Protegido", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  expect(state.activations).toBe(1);
  await page.goto(`/c/${code}`);
  await expect(page).toHaveURL(/\/inicio$/);
  expect(state.activations).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Bem-vindos, Família Teste", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sair deste dispositivo", exact: true })
    .click();
  state.bound = false;
  await page.goto(`/c/${code}`);
  await expect(page.getByLabel("PIN de acesso", { exact: true })).toBeVisible();
  expect(state.activations).toBe(1);
});
test("manual PIN errors are uniform; blocked link never reuses an old binding", async ({
  page,
}) => {
  const state = await backend(page, null);
  await page.goto("/");
  await page.getByLabel("Código do convite", { exact: true }).fill(code);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("9999");
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .click();
  await expect(
    page.getByText("Código ou PIN inválido.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir meu convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goto("/c/OutroCodigoNaoEnumeravelCom32Chars");
  await expect(
    page.getByText("Código ou PIN inválido.", { exact: true }),
  ).toBeVisible();
  expect(page.url()).toContain("/c/");
  state.active = false;
  await page.goto(`/c/${code}`);
  await expect(
    page.getByText("Código ou PIN inválido.", { exact: true }),
  ).toBeVisible();
  expect(page.url()).toContain("/c/");
});
test("revocation refresh removes cached family; new PIN is required for reactivation", async ({
  page,
}) => {
  const state = await backend(page, null);
  await page.goto(`/c/${code}`);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  state.bound = false;
  state.pin = "3478";
  await page.reload();
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
  await page.goto(`/c/${code}`);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(
    page.getByText("Código ou PIN inválido.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("PIN de acesso", { exact: true }).fill("3478");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
});

test("a new browser device needs PIN even after another device activates", async ({
  page,
  browser,
}) => {
  const first = await backend(page, null);
  await page.goto(`/c/${code}`);
  await page.getByLabel("PIN de acesso", { exact: true }).fill("0047");
  await page
    .getByRole("button", { name: "Abrir nosso convite", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inicio$/);
  expect(first.activations).toBe(1);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    const second = await backend(other, null);
    await other.goto(`http://127.0.0.1:8083/c/${code}`);
    await expect(
      other.getByText("Olá, Família Teste!", { exact: true }),
    ).toBeVisible();
    expect(second.activations).toBe(0);
    await expect(
      other.getByLabel("PIN de acesso", { exact: true }),
    ).toBeVisible();
    await expect(
      other.getByText("Integrante Protegido", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("recovery consumes the explicit token, verifies role and removes it from URL", async ({
  page,
}) => {
  await backend(page);
  await page.route("http://127.0.0.1:54321/auth/v1/verify", async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
      });
    expect(route.request().postDataJSON()).toMatchObject({
      token_hash: "RecoveryTokenFixtureOnly1234567890",
      type: "recovery",
    });
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        access_token: `${encode({ alg: "HS256" })}.${encode({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`,
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: {
          id: uid,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: false,
        },
      }),
    });
  });
  await page.goto(
    "/recuperar-senha?token_hash=RecoveryTokenFixtureOnly1234567890&type=recovery&untrusted=removed",
  );
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/recuperar-senha$/);
});

test("an unauthenticated browser never trusts a stale public cache with staff role", async ({
  page,
}) => {
  await backend(page, null);
  await page.addInitScript(() =>
    localStorage.setItem(
      "cache:00000000-0000-4000-8000-000000000001:public",
      JSON.stringify({
        role: "ADMIN",
        guests: [{ name: "Private stale data" }],
        invitations: [],
        rsvps: [],
        contacts: [],
        gifts: [],
        gift_selections: [],
        messages: [],
        announcements: [],
        rules: [],
        credentials: [],
        checkins: [],
        notification_jobs: [],
        sheet_jobs: [],
      }),
    ),
  );
  await page.goto("/painel");
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
  await expect(
    page.getByText("Private stale data", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Abrir meu convite", exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toContain("/painel");
});
