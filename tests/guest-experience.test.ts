import { describe, it, expect } from "vitest";
import { guestGreeting, homeRsvp } from "../src/features/guests/guestDomain";
import { mobileDigits, mobileMask } from "../src/utils/mobilePhone";
import {
  weddingCountdown,
  WEDDING_START,
} from "../src/features/countdown/domain";
import type { Snapshot, RSVP } from "../src/types/domain";
function snapshot(
  kind = "INDIVIDUAL",
  salutation?: string,
  statuses: RSVP[] = ["PENDING"],
) {
  return {
    invitations: [
      { id: "f", kind, primary_guest_id: "0", name: "Família Silva" },
    ],
    guests: statuses.map((_, i) => ({
      id: String(i),
      name: i ? `Membro ${i}` : "Pessoa",
      salutation,
    })),
    rsvps: statuses.map((status, i) => ({ guest_id: String(i), status })),
  } as Snapshot;
}
describe("home sem inferência de gênero", () => {
  it.each([
    ["MALE", "Bem-vindo"],
    ["FEMALE", "Bem-vinda"],
    [undefined, "Boas-vindas"],
  ])("tratamento %s", (gender, prefix) =>
    expect(guestGreeting(snapshot("INDIVIDUAL", gender))).toBe(
      `${prefix}, Pessoa`,
    ),
  );
  it("família usa responsável explícito", () =>
    expect(guestGreeting(snapshot("FAMILY"))).toBe(
      "Bem-vindos, Pessoa e família",
    ));
  it("não deduz responsável pela ordem", () => {
    const s = snapshot("FAMILY");
    s.invitations[0]!.primary_guest_id = null;
    expect(guestGreeting(s)).toBe("Bem-vindos, Família Silva");
  });
  it.each(["CONFIRMED", "DECLINED", "MAYBE", "PENDING"] as RSVP[])(
    "agrega todos %s",
    (status) => {
      const text = homeRsvp(
        snapshot("FAMILY", undefined, [status, status, status]),
      );
      expect(text).not.toContain("pendentes ou diferentes");
      expect(text).toBe(
        {
          CONFIRMED: "Sua presença e a de sua família estão confirmadas",
          DECLINED:
            "Sua ausência e a de sua família foram confirmadas, sentiremos a falta de vocês",
          MAYBE:
            "Ainda dá tempo de você confirmar a sua presença e a de sua família",
          PENDING:
            "Sua presença e a de sua família ainda não estão confirmadas",
        }[status],
      );
    },
  );
  it.each(["CONFIRMED", "DECLINED", "MAYBE", "PENDING"] as RSVP[])(
    "individual %s",
    (status) =>
      expect(homeRsvp(snapshot("INDIVIDUAL", undefined, [status]))).toBe(
        {
          CONFIRMED: "Sua presença está confirmada",
          DECLINED: "Sua ausência foi confirmada, sentiremos sua falta",
          MAYBE: "Ainda dá tempo de você confirmar sua presença",
          PENDING: "Sua presença ainda não foi confirmada",
        }[status],
      ),
  );
  it("misto não afirma confirmação de todos", () =>
    expect(
      homeRsvp(
        snapshot("FAMILY", undefined, [
          "CONFIRMED",
          "DECLINED",
          "MAYBE",
          "PENDING",
        ]),
      ),
    ).toContain("confirmações pendentes ou diferentes"));
  it("contador mantém unidade e valor, acrescentando aspas", () => {
    const now = new Date(WEDDING_START).getTime() - 67 * 86400000;
    expect(weddingCountdown(WEDDING_START, now)).toEqual({
      unit: "days",
      value: 67,
      text: 'Faltam 67 dias até o "Sim"',
    });
  });
});
describe("celular canônico", () => {
  it("máscara e round-trip", () => {
    expect(mobileMask("62999434778")).toBe("(62) 9 9943-4778");
    expect(mobileDigits(mobileMask("62999434778"))).toBe("62999434778");
  });
  it("limite e país", () => {
    expect(mobileDigits("6299943477899")).toHaveLength(11);
    expect(mobileDigits("+55 (62) 9 9943-4778")).toBe("62999434778");
  });
});

it("resposta legada de decisão adiada é apresentada sem reescrever seu histórico", () => {
  const s = snapshot("INDIVIDUAL");
  s.rsvps[0]!.source = "APP";
  s.rsvps[0]!.responded_at = "2026-10-10T12:00:00Z";
  expect(homeRsvp(s)).toBe("Ainda dá tempo de você confirmar sua presença");
  expect(s.rsvps[0]!.status).toBe("PENDING");
});
