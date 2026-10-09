import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  passwordLogin,
  savePassword,
  requireStaff,
  StaffValidationError,
} from "../src/features/auth/staffAuth";
import {
  invitationPin,
  normalizePhone,
  suggestedPin,
  staffDestination,
  codeFromLink,
} from "../src/utils/security";
function client(role: string | null, badPassword = false) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        error: badPassword ? { message: "invalid" } : null,
      }),
      signOut: vi.fn().mockResolvedValue({}),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: role, error: null }),
  };
}
describe("password access verified against backend role", () => {
  it.each([
    ["ADMIN", "/painel"],
    ["CEREMONIALIST", "/checkin"],
  ])("%s uses password and routes to %s", async (role, path) => {
    const c = client(role);
    const actual = await passwordLogin(
      c as unknown as SupabaseClient,
      "event",
      " person@example.com ",
      "password",
    );
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "password",
    });
    expect(c.rpc).toHaveBeenCalledWith("event_role", { p_event: "event" });
    expect(staffDestination(actual)).toBe(path);
    expect(c.auth.signOut).not.toHaveBeenCalled();
  });
  it("incorrect password never queries a privileged role", async () => {
    const c = client("ADMIN", true);
    await expect(
      passwordLogin(c as unknown as SupabaseClient, "event", "e", "bad"),
    ).rejects.toThrow("E-mail ou senha inválidos.");
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it.each([null, "GUEST"])("unauthorized %s signs out", async (role) => {
    const c = client(role);
    await expect(
      passwordLogin(c as unknown as SupabaseClient, "event", "e", "password"),
    ).rejects.toThrow("não tem acesso");
    expect(c.auth.signOut).toHaveBeenCalledOnce();
  });
  it.each(["response", "thrown"])(
    "technical RPC failure (%s) preserves session and permits role retry",
    async (kind) => {
      const c = client("ADMIN");
      if (kind === "response")
        c.rpc.mockResolvedValueOnce({
          data: null,
          error: { message: "temporary failure" },
        });
      else c.rpc.mockRejectedValueOnce(new Error("network failure"));
      await expect(
        requireStaff(c as unknown as SupabaseClient, "event"),
      ).rejects.toBeInstanceOf(StaffValidationError);
      expect(c.auth.signOut).not.toHaveBeenCalled();
      await expect(
        requireStaff(c as unknown as SupabaseClient, "event"),
      ).resolves.toBe("ADMIN");
      expect(c.auth.signOut).not.toHaveBeenCalled();
      expect(c.rpc).toHaveBeenCalledTimes(2);
    },
  );
  it("password changes are own-user Auth operations gated by backend role", async () => {
    const c = client("ADMIN");
    await savePassword(
      c as unknown as SupabaseClient,
      "event",
      "newPassword",
      "newPassword",
    );
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "newPassword" });
  });
  it("invalid confirmation or revoked role cannot update password", async () => {
    const c = client(null);
    await expect(
      savePassword(c as unknown as SupabaseClient, "event", "short", "short"),
    ).rejects.toThrow("8 caracteres");
    await expect(
      savePassword(
        c as unknown as SupabaseClient,
        "event",
        "longPassword",
        "longPassword",
      ),
    ).rejects.toThrow("não tem acesso");
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });
});
describe("family PIN and contacts", () => {
  it("leading zeros are preserved as a string", () => {
    expect(invitationPin.parse("0047")).toBe("0047");
  });
  it.each([47, "47", "12345", "abcd", "123 "])("rejects %s", (pin) =>
    expect(invitationPin.safeParse(pin).success).toBe(false),
  );
  it("suggests last four WhatsApp digits without changing an existing PIN", () => {
    expect(suggestedPin("(62) 99999-3478")).toBe("3478");
    expect(suggestedPin("+55 (62) 99999-0047")).toBe("0047");
    expect(suggestedPin("")).toBeNull();
    expect(normalizePhone("+55 (62) 99999-3478")).toBe("5562999993478");
  });
  it("manual input supports the Pages invitation URL", () =>
    expect(
      codeFromLink(
        "https://example.com/convite-felipe-e-lais/c/CodeSeguroNaoEnumeravelCom32Chars",
      ),
    ).toBe("CodeSeguroNaoEnumeravelCom32Chars"));
});

it("official Supabase Auth persists staff sessions without storing their password", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp, sub: "aaaaaaaa-0000-4000-8000-000000000011" })).toString("base64url")}.test`;
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: "aaaaaaaa-0000-4000-8000-000000000011",
            email: "fixture@example.com",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const options = {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchMock },
  };
  const first = createClient(
    "https://fixture.supabase.test",
    "fixture-public-key",
    options,
  );
  expect(
    (
      await first.auth.signInWithPassword({
        email: "fixture@example.com",
        password: "never-store-this-password",
      })
    ).error,
  ).toBeNull();
  first.auth.stopAutoRefresh();
  const restored = createClient(
    "https://fixture.supabase.test",
    "fixture-public-key",
    options,
  );
  expect((await restored.auth.getSession()).data.session?.user.id).toBe(
    "aaaaaaaa-0000-4000-8000-000000000011",
  );
  restored.auth.stopAutoRefresh();
  expect([...values.values()].join(" ")).not.toContain(
    "never-store-this-password",
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  await restored.auth.signOut({ scope: "local" });
});
