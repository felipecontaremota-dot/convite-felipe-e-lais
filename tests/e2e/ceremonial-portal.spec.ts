import { test, expect, chromium, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { TestPostgres } from "../support/postgres";
const db = new TestPostgres(),
  event = "00000000-0000-4000-8000-000000000001";
const admin = "ce000000-0000-4000-8000-000000000001",
  staff = "ce000000-0000-4000-8000-000000000002";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await db.start();
  db.sql(
    `insert into auth.users(id) values('${admin}'),('${staff}');insert into user_roles(event_id,user_id,role) values('${event}','${admin}','ADMIN'),('${event}','${staff}','CEREMONIALIST');`,
  );
});
test.afterAll(() => db.stop());
const snapshot = () => db.rpc(admin, "app_snapshot", { p_event: event });
const action = (p_action: string, p_payload: object) =>
  db.rpc(admin, "admin_action", { p_event: event, p_action, p_payload });
function person(
  label: string,
  party?: "PADRINHO" | "MADRINHA",
  status = "CONFIRMED",
) {
  const g = action("GUEST_CREATE", {
    name: label,
    group_label: "Convidado(a) da noiva",
    admin_notes: "Observação geral\nLinha preservada",
  });
  if (status !== "PENDING")
    action("GUEST_RSVP_SET", {
      id: g.id,
      status,
      expected_status: "PENDING",
      expected_responded_at: null,
    });
  if (party)
    db.rpc(admin, "wedding_party_admin_set", {
      p_event: event,
      p_guest: g.id,
      p_role: party,
      p_expected_cycle: null,
    });
  db.sql(
    `update rsvps set dietary='Sem lactose',note=E'Nota de RSVP\\nSegunda linha' where guest_id='${g.id}';`,
  );
  return { ...g, name: label };
}
async function backend(
  page: Page,
  uid = staff,
  options: { fail?: boolean; beforeCheckin?: () => Promise<void> } = {},
) {
  const enc = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url"),
    exp = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "ceremonial@example.test",
    is_anonymous: false,
  };
  const session = {
    access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, exp, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  const calls: {
    p_mutation: string;
    p_type: string;
    p_payload: Record<string, unknown>;
  }[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      args = route.request().postDataJSON() || {};
    try {
      let data: unknown = {};
      if (path.startsWith("/auth/"))
        data = path.endsWith("/user") ? user : session;
      else if (path.startsWith("/rest/v1/rpc/")) {
        if (args.p_type) calls.push(args);
        if (args.p_type === "CHECKIN_CREATE") await options.beforeCheckin?.();
        if (
          options.fail &&
          ["CHECKIN_CREATE", "CHECKIN_REVERT"].includes(args.p_type)
        )
          throw Error("controlled failure");
        data = db.rpc(uid, path.split("/").at(-1)!, args);
      }
      await route.fulfill({ json: data });
    } catch {
      await route.fulfill({
        status: 400,
        json: {
          message: "Não foi possível concluir a operação.",
          code: "P0001",
        },
      });
    }
  });
  return calls;
}
async function login(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("ceremonial@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
for (const width of [320, 1280])
  test(`staff portal, real classifications, notes, restrictions and manual entry at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const g = person(`Ágata cerimonial ${width}`, "MADRINHA"),
      other = person(`Bruno cerimonial ${width}`, "PADRINHO", "PENDING");
    const beforeEntries = snapshot().checkins.length;
    const options = { fail: false },
      calls = await backend(page, staff, options);
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.screenshot({
      path: `/tmp/ceremonial-home-${width}.png`,
      animations: "disabled",
    });
    await expect(
      page.getByRole("button", { name: "Ler convite", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Baixar app", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Instale este convite como app",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Ler convite", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dia-do-evento\?scanner=/);
    await expect(page.getByRole("dialog")).toContainText("Ler QR Code");
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Início", exact: true }).click();
    await page
      .getByRole("button", { name: "Ver informações", exact: true })
      .click();
    await expect(page).toHaveURL(/\/informacoes$/);
    await page.getByRole("link", { name: "Local", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Abrir localização", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Início", exact: true }).click();
    await page
      .getByRole("button", { name: "Lista de padrinhos", exact: true })
      .click();
    await page
      .getByLabel("Buscar padrinho ou madrinha")
      .fill(`cerimonial ${width}`);
    await expect(page.getByTestId("operational-party-guest")).toHaveCount(2);
    await expect(
      page
        .getByTestId("operational-party-guest")
        .getByText("Madrinha", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("operational-party-guest")
        .getByText("Padrinho", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/ceremonial-party-${width}.png`,
      animations: "disabled",
    });
    await expect(
      page.getByRole("button", { name: /Promover|Remover padrinho/ }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Lista de convidados", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar nome ou família", exact: true })
      .fill(`agata cerimonial ${width}`);
    const row = page
      .getByTestId("operational-guest")
      .filter({ visible: true })
      .filter({ hasText: g.name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Sem lactose");
    await expect(row).toContainText("Linha preservada");
    await expect(row.getByText("Presente", { exact: true })).toHaveCount(0);
    const manual = page.getByRole("button", {
      name: `Registrar entrada manualmente: ${g.name}`,
      exact: true,
    });
    await manual.click();
    let dialog = page.locator("[data-admin-modal]");
    await expect(dialog).toContainText(
      `Deseja confirmar a entrada de ${g.name}?`,
    );
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(
      snapshot().checkins.some(
        (c: { guest_id: string }) => c.guest_id === g.id,
      ),
    ).toBe(false);
    options.fail = true;
    await manual.click();
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(
      dialog.getByRole("alert").filter({ hasText: /Não foi possível/ }),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(row.getByText("Presente", { exact: true })).toHaveCount(0);
    options.fail = false;
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByText("Presente", { exact: true })).toBeVisible();
    await expect(
      page
        .getByText(`${beforeEntries + 1} check-ins`, { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    const attempts = calls.filter((c) => c.p_type === "CHECKIN_CREATE");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.p_mutation).toBe(attempts[1]!.p_mutation);
    expect(
      snapshot().rsvps.find((r: { guest_id: string }) => r.guest_id === g.id)
        .status,
    ).toBe("CONFIRMED");
    const adminContext = await browser.newContext({
        baseURL: "http://127.0.0.1:8083",
      }),
      adminPage = await adminContext.newPage();
    await backend(adminPage, admin);
    await login(adminPage);
    await adminPage
      .getByRole("link", { name: "Convidados", exact: true })
      .click();
    await expect(
      adminPage
        .locator(`[data-guest-row="${g.id}"]`)
        .getByText("Presente", { exact: true }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("link", { name: "Dia do evento", exact: true }),
    ).toBeVisible();
    const remove = page.getByRole("button", {
      name: `Remover o registro de entrada: ${g.name}`,
      exact: true,
    });
    await remove.click();
    dialog = page.locator("[data-admin-modal]");
    await expect(dialog).toContainText(
      `Deseja remover o registro de entrada de ${g.name}?`,
    );
    const original = snapshot().checkins.find(
      (c: { guest_id: string }) => c.guest_id === g.id,
    );
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(calls.filter((c) => c.p_type === "CHECKIN_REVERT")).toHaveLength(0);
    expect(
      snapshot().checkins.some((c: { id: string }) => c.id === original.id),
    ).toBe(true);
    options.fail = true;
    await remove.click();
    await dialog
      .getByRole("button", { name: "Remover registro", exact: true })
      .click();
    await expect(
      dialog.getByRole("alert").filter({ hasText: /Não foi possível/ }),
    ).toBeVisible();
    await expect(row.getByText("Presente", { exact: true })).toBeVisible();
    options.fail = false;
    await page.screenshot({
      path: `/tmp/checkin-removal-${width}.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Remover registro", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(manual).toBeVisible();
    await expect(row.getByText("Presente", { exact: true })).toHaveCount(0);
    await expect(
      page
        .getByText(`${beforeEntries} check-ins`, { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    const removals = calls.filter((c) => c.p_type === "CHECKIN_REVERT");
    expect(removals).toHaveLength(2);
    expect(removals[0]!.p_mutation).toBe(removals[1]!.p_mutation);
    await expect(
      adminPage
        .locator(`[data-guest-row="${g.id}"]`)
        .getByText("Presente", { exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
    await expect(
      page
        .getByText(new RegExp(`Entrada removida — ${g.name}`))
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText(new RegExp(`Entrada registrada — ${g.name}`))
        .filter({ visible: true }),
    ).toBeVisible();
    await manual.click();
    await dialog
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeVisible();
    await expect(
      page
        .getByText(
          new RegExp(`Entrada removida — ${g.name}.*Operador: Cerimonialista`),
        )
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          new RegExp(
            `Entrada registrada — ${g.name}.*Operador: Cerimonialista`,
          ),
        )
        .filter({ visible: true }),
    ).toHaveCount(2);
    await expect(page.getByText(new RegExp(`Operador: ${staff}`))).toHaveCount(
      0,
    );
    const history = snapshot().checkin_history.filter(
      (c: { guest_id: string }) => c.guest_id === g.id,
    );
    expect(history.map((c: { action: string }) => c.action).sort()).toEqual([
      "ENTRY",
      "ENTRY",
      "REMOVAL",
    ]);
    expect(
      history.every((c: { actor_id: string }) => c.actor_id === staff),
    ).toBe(true);
    expect(
      snapshot().rsvps.find((r: { guest_id: string }) => r.guest_id === g.id)
        .status,
    ).toBe("CONFIRMED");
    await adminContext.close();
    await page.screenshot({
      path: `/tmp/ceremonial-event-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const path of [
      "/convidados",
      "/familias",
      "/gestao-mensagens",
      "/gestao-presentes",
      "/notificacoes",
      "/configuracao",
    ]) {
      await page.goto(path);
      await expect(page.getByText(/Acesso restrito/)).toBeVisible();
    }
    const safe = db.rpc(staff, "app_snapshot", { p_event: event });
    expect(safe.contacts).toHaveLength(0);
    expect(safe.gifts).toHaveLength(0);
    expect(safe.messages).toHaveLength(0);
    expect(safe.credentials).toHaveLength(0);
    expect(
      safe.guests.find((p: { id: string }) => p.id === other.id).party_role,
    ).toBe("PADRINHO");
  });

test("real QR decoding through simulated camera, automatic registration and duplicates", async () => {
  test.setTimeout(120000);
  const g = person("Convidado câmera real");
  const ticket = db.rpc(admin, "issue_ticket", {
    p_event: event,
    p_guest: g.id,
    p_regenerate: false,
  });
  const video = `/tmp/ceremonial-${randomUUID()}.y4m`;
  execFileSync(process.execPath, [
    "tests/support/qr-video.mjs",
    video,
    `wedding://ticket/${ticket.token}`,
  ]);
  const browser = await chromium.launch({
    // Full Chromium/new headless, matching real browser media APIs. The default
    // Playwright Headless Shell is a different executable from the local browser.
    channel: "chromium",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  try {
    const context = await browser.newContext({
        baseURL: "http://127.0.0.1:8083",
        permissions: ["camera"],
        viewport: { width: 390, height: 844 },
      }),
      page = await context.newPage();
    // The SDK's existing WASM fallback is served from the installed dependency in
    // this isolated test; the QR decoder itself is real, not a fake event.
    await page.route(/zxing.*\.wasm/, (route) =>
      route.fulfill({
        path: "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
        contentType: "application/wasm",
      }),
    );
    await backend(page);
    await login(page);
    await page
      .getByRole("link", { name: "Lista de convidados", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ler QR Code", exact: true })
      .click();
    try {
      await expect(
        page.getByRole("dialog", {
          name: `Entrada de ${g.name} registrada`,
          exact: true,
        }),
      ).toBeVisible({ timeout: 30000 });
    } catch (cause) {
      // Media metadata and UI errors only; never log QR contents or credentials.
      const media = await page.evaluate(() => {
        const v = document.querySelector("video");
        return v
          ? {
              readyState: v.readyState,
              width: v.videoWidth,
              height: v.videoHeight,
              paused: v.paused,
              currentTime: v.currentTime,
              mediaError: v.error?.code,
            }
          : null;
      });
      const alerts = await page.getByRole("alert").allTextContents();
      throw new Error(
        `Camera QR validation failed: ${JSON.stringify({ media, alerts })}`,
        { cause },
      );
    }
    expect(
      snapshot().checkins.filter(
        (c: { guest_id: string }) => c.guest_id === g.id,
      ),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Ok", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Fechar câmera e usar busca manual",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Token ou conteúdo do QR (entrada acessível)")
      .fill(`wedding://ticket/${ticket.token}`);
    await page
      .getByRole("button", { name: "Validar convite", exact: true })
      .click();
    await expect(
      page.getByText("Este convidado já teve sua entrada registrada.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      snapshot().checkins.filter(
        (c: { guest_id: string }) => c.guest_id === g.id,
      ),
    ).toHaveLength(1);
    const original = snapshot().checkins.find(
      (c: { guest_id: string }) => c.guest_id === g.id,
    );
    await page
      .getByRole("button", {
        name: `Remover o registro de entrada: ${g.name}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Remover registro", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: `Registrar entrada manualmente: ${g.name}`,
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Ler QR Code", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: `Entrada de ${g.name} registrada`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Ok", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Fechar câmera e usar busca manual",
        exact: true,
      })
      .click();
    const reentry = snapshot().checkins.filter(
      (c: { guest_id: string }) => c.guest_id === g.id,
    );
    expect(reentry).toHaveLength(1);
    expect(reentry[0].id).not.toBe(original.id);
    expect(
      snapshot().checkin_history.filter(
        (h: { guest_id: string }) => h.guest_id === g.id,
      ),
    ).toHaveLength(3);
    await page
      .getByLabel("Token ou conteúdo do QR (entrada acessível)")
      .fill("not-a-QR");
    await page
      .getByRole("button", { name: "Validar convite", exact: true })
      .click();
    await expect(page.getByText(/QR Code inválido/)).toBeVisible();
    await page.screenshot({
      path: "/tmp/ceremonial-camera.png",
      animations: "disabled",
    });
    await context.close();
  } finally {
    await browser.close();
    unlinkSync(video);
  }
});

for (const scenario of [
  { uid: staff, width: 320 },
  { uid: admin, width: 1280 },
])
  test(`QR confirmation waits for backend, pauses reads and continues without restarting at ${scenario.width}px`, async () => {
    test.setTimeout(120000);
    const first = person(`Primeira leitura ${scenario.width}`),
      second = person(`Segunda leitura ${scenario.width}`);
    const tickets = [first, second].map((g) =>
      db.rpc(admin, "issue_ticket", {
        p_event: event,
        p_guest: g.id,
        p_regenerate: false,
      }),
    );
    const videoFile = `/tmp/ceremonial-sequence-${randomUUID()}.y4m`;
    execFileSync(process.execPath, [
      "tests/support/qr-video.mjs",
      videoFile,
      ...tickets.map((t) => `wedding://ticket/${t.token}`),
    ]);
    const browser = await chromium.launch({
      channel: "chromium",
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
      args: [
        "--no-sandbox",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${videoFile}`,
      ],
    });
    let release = () => {};
    try {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:8083",
        permissions: ["camera"],
        viewport: { width: scenario.width, height: 900 },
      });
      const page = await context.newPage();
      await page.route(/zxing.*\.wasm/, (route) =>
        route.fulfill({
          path: "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
          contentType: "application/wasm",
        }),
      );
      const options: { fail?: boolean; beforeCheckin?: () => Promise<void> } = {
        fail: true,
      };
      const calls = await backend(page, scenario.uid, options);
      await login(page);
      await page
        .getByRole("link", {
          name:
            scenario.uid === admin ? "Dia do evento" : "Lista de convidados",
          exact: true,
        })
        .click();
      // Neither invalid content nor a failed real mutation may show success.
      await page
        .getByLabel("Token ou conteúdo do QR (entrada acessível)")
        .fill("invalid");
      await page
        .getByRole("button", { name: "Validar convite", exact: true })
        .click();
      await expect(page.getByText(/QR Code inválido/)).toBeVisible();
      expect(calls).toHaveLength(0);
      await page
        .getByLabel("Token ou conteúdo do QR (entrada acessível)")
        .fill(`wedding://ticket/${tickets[0].token}`);
      await page
        .getByRole("button", { name: "Validar convite", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: /Não foi possível/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", { name: /^Entrada de/ }),
      ).toHaveCount(0);
      expect(
        snapshot().checkins.some(
          (c: { guest_id: string }) => c.guest_id === first.id,
        ),
      ).toBe(false);
      options.fail = false;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let waiting = true;
      options.beforeCheckin = async () => {
        if (waiting) {
          waiting = false;
          await gate;
        }
      };
      await page
        .getByRole("button", { name: "Ler QR Code", exact: true })
        .click();
      await expect.poll(() => calls.length).toBe(2);
      await expect(
        page.getByRole("dialog", { name: /^Entrada de/ }),
      ).toHaveCount(0);
      expect(
        snapshot().checkins.some(
          (c: { guest_id: string }) => c.guest_id === first.id,
        ),
      ).toBe(false);
      const video = page.getByTestId("camera-preview").locator("video");
      const stream = await video.evaluateHandle(
        (v: HTMLVideoElement) => v.srcObject as MediaStream,
      );
      release();
      const confirmation = page.getByRole("dialog", {
        name: `Entrada de ${first.name} registrada`,
        exact: true,
      });
      await expect(confirmation).toBeVisible({ timeout: 30000 });
      await expect(confirmation.getByRole("button")).toHaveCount(1);
      await expect(
        confirmation.getByRole("button", { name: "Ok", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(confirmation).toBeVisible();
      // The live camera now presents another QR; no mutation is allowed until Ok.
      await page.waitForTimeout(7000);
      expect(calls).toHaveLength(2);
      expect(
        snapshot().checkins.some(
          (c: { guest_id: string }) => c.guest_id === second.id,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `/tmp/qr-confirmation-${scenario.width}.png`,
        animations: "disabled",
      });
      await confirmation
        .getByRole("button", { name: "Ok", exact: true })
        .click();
      const next = page.getByRole("dialog", {
        name: `Entrada de ${second.name} registrada`,
        exact: true,
      });
      await expect(next).toBeVisible({ timeout: 30000 });
      expect(calls).toHaveLength(3);
      expect(
        await stream.evaluate((s) =>
          s.getTracks().every((t) => t.readyState === "live"),
        ),
      ).toBe(true);
      expect(
        await video.evaluate(
          (v: HTMLVideoElement, s: MediaStream) => v.srcObject === s,
          stream,
        ),
      ).toBe(true);
      expect(
        snapshot().checkins.filter((c: { guest_id: string }) =>
          [first.id, second.id].includes(c.guest_id),
        ),
      ).toHaveLength(2);
      await next.getByRole("button", { name: "Ok", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Fechar câmera e usar busca manual",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("dialog", { name: /^Entrada de/ }),
      ).toHaveCount(0);
      const row = page
        .getByTestId("operational-guest")
        .filter({ visible: true })
        .filter({ hasText: first.name });
      await expect(row.getByText("Presente", { exact: true })).toBeVisible();
      await page
        .getByRole("button", {
          name: `Remover o registro de entrada: ${first.name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Remover registro", exact: true })
        .click();
      const operator = scenario.uid === admin ? "Noivos" : "Cerimonialista";
      await expect(
        page
          .getByText(
            new RegExp(
              `Entrada registrada — ${first.name}.*Operador: ${operator}`,
            ),
          )
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page
          .getByText(
            new RegExp(
              `Entrada removida — ${first.name}.*Operador: ${operator}`,
            ),
          )
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page.getByText(new RegExp(`Operador: ${scenario.uid}`)),
      ).toHaveCount(0);
      await context.close();
    } finally {
      release();
      await browser.close();
      unlinkSync(videoFile);
    }
  });

test("historical operator without a recognized event role never exposes its UUID", async ({
  page,
}) => {
  const operator = randomUUID(),
    g = person("Histórico sem papel atual");
  db.sql(
    `insert into auth.users(id) values('${operator}');insert into user_roles(event_id,user_id,role) values('${event}','${operator}','CEREMONIALIST');`,
  );
  const created = db.rpc(operator, "app_mutate", {
    p_event: event,
    p_mutation: randomUUID(),
    p_type: "CHECKIN_CREATE",
    p_payload: { guest_id: g.id, method: "MANUAL" },
  });
  db.rpc(operator, "app_mutate", {
    p_event: event,
    p_mutation: randomUUID(),
    p_type: "CHECKIN_REVERT",
    p_payload: { id: created.id },
  });
  db.sql(
    `delete from user_roles where event_id='${event}' and user_id='${operator}';`,
  );
  await backend(page, admin);
  await login(page);
  await page.getByRole("link", { name: "Dia do evento", exact: true }).click();
  for (const label of ["Entrada registrada", "Entrada removida"])
    await expect(
      page
        .getByText(
          new RegExp(
            `${label} — ${g.name}.*Operador: Operador não identificado`,
          ),
        )
        .filter({ visible: true }),
    ).toBeVisible();
  await expect(page.getByText(new RegExp(`Operador: ${operator}`))).toHaveCount(
    0,
  );
});

test("camera denial has a manual fallback and never records an entry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  const before = snapshot().checkins.length;
  await backend(page);
  await login(page);
  await page
    .getByRole("link", { name: "Lista de convidados", exact: true })
    .click();
  await page.getByRole("button", { name: "Ler QR Code", exact: true }).click();
  await expect(
    page.getByText(
      /Câmera não autorizada ou indisponível|Não foi possível iniciar a câmera/,
    ),
  ).toBeVisible();
  expect(snapshot().checkins).toHaveLength(before);
});

test("an entry from another operator updates the open operational screen and party list", async ({
  page,
}) => {
  const g = person("Sincronização entre operadores", "MADRINHA");
  await backend(page);
  await login(page);
  await page
    .getByRole("link", { name: "Lista de convidados", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Buscar nome ou família", exact: true })
    .fill(g.name);
  const row = page
    .getByTestId("operational-guest")
    .filter({ visible: true })
    .filter({ hasText: g.name });
  await expect(row.getByText("Presente", { exact: true })).toHaveCount(0);
  const before = snapshot().checkins.length;
  db.rpc(admin, "app_mutate", {
    p_event: event,
    p_mutation: randomUUID(),
    p_type: "CHECKIN_CREATE",
    p_payload: { guest_id: g.id, method: "MANUAL" },
  });
  await expect(row.getByText("Presente", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByText(`${before + 1} check-ins`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Padrinhos", exact: true }).click();
  await page.getByLabel("Buscar padrinho ou madrinha").fill(g.name);
  await expect(
    page
      .getByTestId("operational-party-guest")
      .getByText("Presente", { exact: true }),
  ).toBeVisible();
  const active = snapshot().checkins.find(
    (c: { guest_id: string }) => c.guest_id === g.id,
  );
  db.rpc(admin, "app_mutate", {
    p_event: event,
    p_mutation: randomUUID(),
    p_type: "CHECKIN_REVERT",
    p_payload: { id: active.id },
  });
  await expect(
    page
      .getByTestId("operational-party-guest")
      .getByText("Presente", { exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
});

test("unavailable camera shows an actionable message without a check-in", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("No device", "NotFoundError");
      },
    });
  });
  await backend(page);
  const before = snapshot().checkins.length;
  await login(page);
  await page
    .getByRole("link", { name: "Lista de convidados", exact: true })
    .click();
  await page.getByRole("button", { name: "Ler QR Code", exact: true }).click();
  await expect(
    page.getByText(
      /Câmera indisponível|Câmera não autorizada ou indisponível|Não foi possível iniciar a câmera/,
    ),
  ).toBeVisible();
  expect(snapshot().checkins).toHaveLength(before);
});

test("camera preview stays visible before any QR is presented", async () => {
  const browser = await chromium.launch({
    channel: "chromium",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: ["--no-sandbox", "--use-fake-device-for-media-stream"],
  });
  try {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:8083",
      permissions: ["camera"],
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.route(/zxing.*\.wasm/, (route) =>
      route.fulfill({
        path: "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
        contentType: "application/wasm",
      }),
    );
    await backend(page);
    await login(page);
    await page
      .getByRole("link", { name: "Lista de convidados", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ler QR Code", exact: true })
      .click();
    const video = page.getByTestId("camera-preview").locator("video");
    await video.waitFor({ state: "attached" });
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        video.evaluate((v: HTMLVideoElement) => v.readyState >= 2 && !v.paused),
      )
      .toBe(true);
    const dimensions = await video.evaluate((v: HTMLVideoElement) => ({
      box: v.getBoundingClientRect().toJSON(),
      ready: v.readyState,
      width: v.videoWidth,
      height: v.videoHeight,
      paused: v.paused,
    }));
    console.log("Camera preview dimensions", JSON.stringify(dimensions));
    expect(dimensions.box.height).toBeGreaterThan(200);
    await expect(video).toBeInViewport();
    const before = snapshot().checkins.length;
    const stream = await video.evaluateHandle(
      (v: HTMLVideoElement) => v.srcObject as MediaStream,
    );
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        stream.evaluate((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
    await expect(page.getByTestId("camera-preview")).toHaveCount(0);
    await page.getByRole("link", { name: "Início", exact: true }).click();
    await page
      .getByRole("button", { name: "Ler convite", exact: true })
      .click();
    await expect(
      page.getByTestId("camera-preview").locator("video"),
    ).toBeVisible();
    expect(snapshot().checkins).toHaveLength(before);
    await page.screenshot({ path: "/tmp/camera-preview-after.png" });
    await context.close();
  } finally {
    await browser.close();
  }
});
