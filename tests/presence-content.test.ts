import { describe, expect, it } from "vitest";
import { effectiveResponse } from "../src/features/rsvp/presenceContent";
import type { OfflineMutation, RsvpRecord } from "../src/types/domain";
const record: RsvpRecord = {
  guest_id: "person",
  event_id: "event",
  status: "PENDING",
  responded_at: null,
  source: "APP",
  dietary: "vegetariano",
  note: "nota",
};
const queued = (status: string, guest = "person"): OfflineMutation => ({
  mutationId: "mutation",
  type: "RSVP_UPDATE",
  payload: { guest_id: guest, status, dietary: "novo", note: "atual" },
  createdAt: "2026-10-11T00:00:00Z",
  attempts: 0,
  lastError: null,
});
describe("Presence response evidence", () => {
  it("does not treat untouched PENDING as an answer", () => {
    expect(effectiveResponse("person", record, []).answered).toBe(false);
    expect(effectiveResponse("person", undefined, []).answered).toBe(false);
  });
  it("recognizes explicit server PENDING by responded_at", () => {
    expect(
      effectiveResponse(
        "person",
        { ...record, responded_at: "2026-10-11T00:00:00Z" },
        [],
      ).answered,
    ).toBe(true);
  });
  it.each(["CONFIRMED", "DECLINED", "PENDING"])(
    "recognizes queued %s without manufacturing a timestamp",
    (status) => {
      expect(effectiveResponse("person", record, [queued(status)])).toEqual({
        status,
        dietary: "novo",
        note: "atual",
        answered: true,
      });
      expect(record.responded_at).toBeNull();
    },
  );
  it("uses the last response belonging to this guest, preserving queue order", () => {
    const queue = [
      queued("CONFIRMED"),
      queued("PENDING"),
      queued("DECLINED", "other"),
    ];
    expect(effectiveResponse("person", record, queue).status).toBe("PENDING");
    expect(queue.map((q) => q.payload.status)).toEqual([
      "CONFIRMED",
      "PENDING",
      "DECLINED",
    ]);
  });
  it("supports an offline response when no RSVP row exists yet", () => {
    expect(
      effectiveResponse("person", undefined, [queued("PENDING")]).answered,
    ).toBe(true);
  });
});

// Literal contract: a typo in shared labels/messages must also fail the tests.
it("preserves the exact approved copy and the four o'clock emoji", async () => {
  const { presenceChoices, confirmationLabels, responseMessages } =
    await import("../src/features/rsvp/presenceContent");
  expect(presenceChoices.map((o) => o.label)).toEqual([
    "Já tô com a roupa de ir!!!",
    "Vou deixar meu lugar pra outro sortudo!",
    "Vou ver e te aviso...",
  ]);
  expect(confirmationLabels).toEqual({
    CONFIRMED: "Pode reservar meu lugar! 🎉",
    DECLINED: "Pode passar minha vez! 💔",
    PENDING: "Deixa eu fazer um suspense... 🕓",
  });
  expect(responseMessages).toEqual({
    CONFIRMED:
      "Aeeee! 🎉 Agora sim, a festa tá ficando completa! Já estamos contando com você pra celebrar, se divertir e fazer parte desse dia inesquecível. Só não vale furar, hein?! ❤️",
    DECLINED:
      "Ahhh, que pena! 🥹💔 A gente queria muito você com a gente! Mas tudo bem... vamos tentar nos divertir mesmo com essa ausência ilustre! ❤️",
    PENDING:
      "Opa, temos um suspense no ar! 👀 Mas não demora muito pra decidir, hein?! A gente tá torcendo pra você dizer SIM! ❤️🎉",
  });
});
