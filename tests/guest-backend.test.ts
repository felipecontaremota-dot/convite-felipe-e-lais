import { vi, it, expect, beforeEach } from "vitest";
const backend = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({
  supabase: backend,
  eventId: "event-fixture",
}));
import {
  checkGuestBackend,
  identifyGuest,
  mutate,
} from "../src/repositories/api";
import { guestSchemaMessage } from "../src/features/guests/backendContract";
beforeEach(() => vi.resetAllMocks());
it("a pre-007 backend cannot silently accept identification or online RSVP", async () => {
  backend.rpc.mockResolvedValue({
    data: { role: "GUEST", guests: [] },
    error: null,
  });
  await expect(checkGuestBackend()).rejects.toMatchObject({
    code: "SCHEMA",
    message: guestSchemaMessage,
  });
  expect(backend.rpc).toHaveBeenCalledWith("app_snapshot", {
    p_event: "event-fixture",
  });
});
it("an applied 007 supports guests without a selected identity", async () => {
  backend.rpc.mockResolvedValue({
    data: { current_guest_id: null, family_credentials: [] },
    error: null,
  });
  await expect(checkGuestBackend()).resolves.toBeUndefined();
});
it.each(["PGRST202", "42883"])(
  "missing RPC %s reports schema incompatibility without leaking backend detail",
  async (code) => {
    backend.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "private backend details" },
    });
    await expect(identifyGuest("guest-fixture")).rejects.toMatchObject({
      code: "SCHEMA",
      message: guestSchemaMessage,
    });
  },
);
it("old RSVP enum remains a schema error, not an authentication failure", async () => {
  backend.rpc.mockResolvedValue({
    data: null,
    error: {
      code: "22P02",
      message: 'invalid input value for enum rsvp_status: "MAYBE"',
    },
  });
  await expect(
    mutate({
      mutationId: "fixed-id",
      type: "RSVP_UPDATE",
      payload: { guest_id: "guest-fixture", status: "MAYBE" },
      createdAt: "fixture",
      attempts: 0,
      lastError: null,
    }),
  ).rejects.toMatchObject({ code: "SCHEMA", message: guestSchemaMessage });
});
it("transport failures stay retryable network errors", async () => {
  backend.rpc.mockResolvedValue({
    data: null,
    error: { code: "", message: "Failed to fetch" },
  });
  await expect(checkGuestBackend()).rejects.toMatchObject({ code: "NETWORK" });
});
