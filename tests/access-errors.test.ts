import {
  invitationAccess,
  accessMessages,
  messageDeliverySummary,
  dispatchMessage,
} from "../src/repositories/api";
import { vi, it, expect, beforeEach } from "vitest";
const c = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), signInAnonymously: vi.fn() },
  functions: { invoke: vi.fn() },
}));
vi.mock("../src/lib/supabase", () => ({ supabase: c, eventId: "event" }));
const code = "CodeSeguroNaoEnumeravelCom32Chars";
beforeEach(() => {
  vi.resetAllMocks();
  c.auth.getSession.mockResolvedValue({
    data: { session: { user: { is_anonymous: true } } },
    error: null,
  });
});
it("valid identification returns name without activation or password", async () => {
  c.functions.invoke.mockResolvedValue({
    data: { name: "Individual", activated: false },
    error: null,
  });
  expect(await invitationAccess(code)).toEqual({
    name: "Individual",
    activated: false,
  });
  expect(c.functions.invoke).toHaveBeenCalledWith("redeem-invitation", {
    body: { event_id: "event", code, action: "identify" },
  });
});
it.each([
  ["invalid_link", undefined, accessMessages.link],
  ["invalid_link", "0047", accessMessages.unavailable],
  ["invalid_password", "9999", accessMessages.password],
  ["technical", undefined, accessMessages.identifyTechnical],
])(
  "public error %s with password %s remains distinct",
  async (codeError, pin, message) => {
    c.functions.invoke.mockResolvedValue({
      error: { context: Response.json({ code: codeError }, { status: 400 }) },
    });
    await expect(invitationAccess(code, pin)).rejects.toThrow(message);
  },
);
it("network/CORS failure does not become password error", async () => {
  c.functions.invoke.mockResolvedValue({ error: Error("Failed to fetch") });
  await expect(invitationAccess(code)).rejects.toThrow(
    accessMessages.identifyTechnical,
  );
  await expect(invitationAccess(code, "0047")).rejects.toThrow(
    accessMessages.redeemTechnical,
  );
});
it("administrative session never invokes or changes anonymous auth", async () => {
  c.auth.getSession.mockResolvedValue({
    data: { session: { user: { is_anonymous: false } } },
    error: null,
  });
  await expect(invitationAccess(code)).rejects.toThrow(accessMessages.staff);
  expect(c.functions.invoke).not.toHaveBeenCalled();
  expect(c.auth.signInAnonymously).not.toHaveBeenCalled();
});
it("dispatch summary never calls skipped or failed email sent", () => {
  for (const status of ["skipped", "failed", "pending"]) {
    const message = messageDeliverySummary(["EMAIL"], {
      sent: 0,
      skipped: 0,
      failed: 0,
      results: [{ channel: "EMAIL", status, reason: "Consentimento ausente" }],
    });
    expect(message).not.toContain("E-mail enviado.");
  }
  expect(
    messageDeliverySummary(["EMAIL"], {
      sent: 1,
      skipped: 0,
      failed: 0,
      results: [{ channel: "EMAIL", status: "sent" }],
    }),
  ).toBe("Mensagem registrada. E-mail enviado.");
  expect(
    messageDeliverySummary(["IN_APP"], {
      sent: 1,
      skipped: 0,
      failed: 0,
      results: [{ channel: "IN_APP", status: "sent" }],
    }),
  ).toBe("Mensagem enviada no aplicativo.");
});

it("duplicate/legacy mutation with unknown message ID cannot claim unrelated email success", async () => {
  c.functions.invoke.mockResolvedValue({
    data: {
      sent: 1,
      skipped: 0,
      failed: 0,
      results: [{ channel: "EMAIL", status: "sent" }],
    },
    error: null,
  });
  await expect(dispatchMessage(["EMAIL"], "")).rejects.toThrow("identificar");
  expect(c.functions.invoke).not.toHaveBeenCalled();
  expect(
    await dispatchMessage(["EMAIL"], "11111111-1111-4111-8111-111111111111"),
  ).toBe("Mensagem registrada. E-mail enviado.");
});
