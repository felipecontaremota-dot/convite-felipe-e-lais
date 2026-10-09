import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseRecovery,
  captureRecoveryUrl,
  takeRecoveryUrl,
  establishRecovery,
} from "../src/features/auth/recoverySession";
const token = "RecoveryTokenFixtureOnly1234567890";
function client(session: unknown = { user: { id: "staff-fixture" } }) {
  const result = { data: { session }, error: null };
  return {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue(result),
      setSession: vi.fn().mockResolvedValue(result),
      getSession: vi.fn().mockResolvedValue(result),
    },
  };
}
describe("official recovery formats", () => {
  it("token_hash is verified only through verifyOtp", async () => {
    const c = client();
    await establishRecovery(
      c as unknown as SupabaseClient,
      parseRecovery(`?token_hash=${token}&type=recovery`, ""),
    );
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: token,
      type: "recovery",
    });
    expect(c.auth.setSession).not.toHaveBeenCalled();
  });
  it("implicit tokens use official setSession, never verifyOtp", async () => {
    const c = client();
    await establishRecovery(
      c as unknown as SupabaseClient,
      parseRecovery(
        "",
        "#access_token=fixture-access&refresh_token=fixture-refresh&type=recovery&expires_in=3600",
      ),
    );
    expect(c.auth.setSession).toHaveBeenCalledWith({
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
    });
    expect(c.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("restores an existing session without re-consuming credentials", async () => {
    const c = client();
    await establishRecovery(
      c as unknown as SupabaseClient,
      parseRecovery("", ""),
    );
    expect(c.auth.getSession).toHaveBeenCalledOnce();
    expect(c.auth.verifyOtp).not.toHaveBeenCalled();
    expect(c.auth.setSession).not.toHaveBeenCalled();
  });
  it("missing existing session cannot expose the password form", async () => {
    const c = client(null);
    await expect(
      establishRecovery(c as unknown as SupabaseClient, { kind: "existing" }),
    ).rejects.toThrow("Link de recuperação inválido ou expirado.");
  });
  it.each(["error", "error_code", "error_description"])(
    "rejects %s without echoing provider content",
    async (key) => {
      const input = parseRecovery(
        "",
        `#${key}=untrusted-content&type=recovery`,
      );
      expect(input).toEqual({ kind: "invalid" });
      const c = client();
      await expect(
        establishRecovery(c as unknown as SupabaseClient, input),
      ).rejects.toThrow("Link de recuperação inválido ou expirado.");
      expect(c.auth.setSession).not.toHaveBeenCalled();
      expect(c.auth.getSession).not.toHaveBeenCalled();
    },
  );
  it.each([
    "#access_token=fixture&type=recovery",
    "#access_token=fixture&refresh_token=fixture&type=signup",
  ])("rejects incomplete or wrong-purpose fragment %s", (hash) =>
    expect(parseRecovery("", hash)).toEqual({ kind: "invalid" }),
  );
  it("clears URL immediately and hands off only once, without persistent storage", () => {
    const clear = vi.fn();
    captureRecoveryUrl(
      {
        pathname: "/convite-felipe-e-lais/recuperar-senha",
        search: "",
        hash: "#access_token=fixture-access&refresh_token=fixture-refresh&type=recovery",
      },
      clear,
    );
    expect(clear).toHaveBeenCalledOnce();
    expect(takeRecoveryUrl()).toEqual({
      kind: "implicit",
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
    });
    expect(takeRecoveryUrl()).toBeUndefined();
  });
  it("never imports an implicit session from another route", () => {
    const clear = vi.fn();
    captureRecoveryUrl(
      {
        pathname: "/login",
        search: "",
        hash: "#access_token=fixture-access&refresh_token=fixture-refresh&type=recovery",
      },
      clear,
    );
    expect(clear).not.toHaveBeenCalled();
    expect(takeRecoveryUrl()).toBeUndefined();
  });
});

it("captures and scrubs query token_hash before Router can retain it", () => {
  const clear = vi.fn();
  captureRecoveryUrl(
    {
      pathname: "/recuperar-senha",
      search: `?token_hash=${token}&type=recovery`,
      hash: "",
    },
    clear,
  );
  expect(clear).toHaveBeenCalledOnce();
  expect(takeRecoveryUrl()).toEqual({ kind: "token_hash", token_hash: token });
});
