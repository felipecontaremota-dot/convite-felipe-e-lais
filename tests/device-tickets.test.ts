import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Credential, Ticket } from "../src/types/domain";
import { getDeviceTicket } from "../src/repositories/tickets";
const state = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock("../src/storage/driver", () => ({
  readCache: async (key: string) => state.cache.get(key) ?? null,
  updateCache: async (key: string, update: (value: unknown) => unknown) => {
    state.cache.set(key, update(state.cache.get(key) ?? null));
  },
}));
vi.mock("../src/repositories/demo", () => ({
  hashToken: async (token: string) =>
    (await import("node:crypto"))
      .createHash("sha256")
      .update(token)
      .digest("hex"),
}));
const token = "a".repeat(64),
  nextToken = "b".repeat(64),
  guest = "guest";
const old: Ticket = { guest_id: guest, token },
  next: Ticket = { guest_id: guest, token: nextToken };
const credential = (value = token, id = "credential") =>
  ({
    id,
    guest_id: guest,
    token_hash: createHash("sha256").update(value).digest("hex"),
    revoked_at: null,
  }) as Credential;
const scope = "event:user",
  key = `tickets:${scope}`;
beforeEach(() => state.cache.clear());
describe("device QR credentials", () => {
  it("issues once and reuses an authorized token on the same device, even offline", async () => {
    const issue = vi.fn().mockResolvedValue(old);
    expect(await getDeviceTicket(scope, guest, [], true, false, issue)).toEqual(
      old,
    );
    expect(state.cache.get(key)).toEqual([old]);
    expect(
      await getDeviceTicket(scope, guest, [credential()], false, false, issue),
    ).toEqual(old);
    expect(issue).toHaveBeenCalledTimes(1);
  });
  it("another device with an active hash requires explicit replacement without any issuer call", async () => {
    const issue = vi.fn();
    await expect(
      getDeviceTicket(scope, guest, [credential()], true, false, issue),
    ).rejects.toMatchObject({ code: "TICKET_REPLACEMENT_REQUIRED" });
    expect(issue).not.toHaveBeenCalled();
  });
  it("does not display a revoked or mismatched local token", async () => {
    state.cache.set(key, [old]);
    const issue = vi.fn();
    await expect(
      getDeviceTicket(
        scope,
        guest,
        [credential(nextToken)],
        true,
        false,
        issue,
      ),
    ).rejects.toMatchObject({ code: "TICKET_REPLACEMENT_REQUIRED" });
    expect(state.cache.get(key)).toEqual([]);
    expect(issue).not.toHaveBeenCalled();
  });
  it("replacement passes the exact confirmed credential and saves only the new token", async () => {
    state.cache.set(key, [old]);
    const issue = vi.fn().mockResolvedValue(next);
    expect(
      await getDeviceTicket(
        scope,
        guest,
        [credential()],
        true,
        true,
        issue,
        "credential",
      ),
    ).toEqual(next);
    expect(issue).toHaveBeenCalledWith(true, "credential");
    expect(state.cache.get(key)).toEqual([next]);
  });
  it.each([undefined, "old-credential"])(
    "rejects missing/stale expected ID %s before replacement",
    async (expected) => {
      const issue = vi.fn();
      await expect(
        getDeviceTicket(
          scope,
          guest,
          [credential()],
          true,
          true,
          issue,
          expected,
        ),
      ).rejects.toMatchObject({ code: "TICKET_CHANGED" });
      expect(issue).not.toHaveBeenCalled();
    },
  );
  it("does not overwrite the old cache when the authorized server replacement fails", async () => {
    state.cache.set(key, [old]);
    await expect(
      getDeviceTicket(
        scope,
        guest,
        [credential()],
        true,
        true,
        async () => {
          throw Error("server failed");
        },
        "credential",
      ),
    ).rejects.toThrow("server failed");
    expect(state.cache.get(key)).toEqual([old]);
  });
  it("keeps account/event scopes separate and blocks new issuance offline", async () => {
    state.cache.set(key, [old]);
    const issue = vi.fn();
    await expect(
      getDeviceTicket("other:user", guest, [credential()], true, false, issue),
    ).rejects.toMatchObject({ code: "TICKET_REPLACEMENT_REQUIRED" });
    await expect(
      getDeviceTicket(scope, guest, [], false, false, issue),
    ).rejects.toThrow(/Conecte-se/);
    expect(issue).not.toHaveBeenCalled();
  });
  it("coalesces repeated reads without silently converting them into rotation", async () => {
    let release!: (ticket: Ticket) => void;
    const issue = vi.fn(
      () =>
        new Promise<Ticket>((resolve) => {
          release = resolve;
        }),
    );
    const a = getDeviceTicket(scope, guest, [], true, false, issue),
      b = getDeviceTicket(scope, guest, [], true, false, issue);
    await vi.waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    release(old);
    expect(await a).toEqual(old);
    expect(await b).toEqual(old);
  });
});
