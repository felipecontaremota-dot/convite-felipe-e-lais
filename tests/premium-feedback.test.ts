import { expect, it } from "vitest";
import { invitationActionOutcome } from "../src/features/guests/invitationActionOutcome";
import { feedbackColors, rsvpTone } from "../src/theme/feedback";
const base = {
  message: "Resultado do contrato",
  complete: true,
  pending: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};
it("only a confirmed provider acceptance produces email success", () => {
  expect(invitationActionOutcome({ ...base, sent: 1 })).toEqual({
    message: "E-mail enviado",
    confirmed: true,
  });
  expect(
    invitationActionOutcome({ ...base, complete: false, pending: 1 }),
  ).toMatchObject({ confirmed: false, message: "Envio pendente" });
  expect(
    invitationActionOutcome({
      ...base,
      skipped: 1,
      message: "Demonstração: nenhum e-mail foi enviado.",
    }),
  ).toMatchObject({ confirmed: false });
  expect(() =>
    invitationActionOutcome({ ...base, failed: 1, message: "Envio rejeitado" }),
  ).toThrow("Envio rejeitado");
});
it("canonical RSVP maps to semantic tones", () => {
  expect(rsvpTone("CONFIRMED")).toBe("confirmed");
  expect(rsvpTone("DECLINED")).toBe("declined");
  expect(rsvpTone("PENDING")).toBe("neutral");
});
function luminance(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const s = parseInt(v, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
it.each(Object.values(feedbackColors))(
  "semantic tag text meets AA contrast",
  (tone) => {
    const values = [luminance(tone.background), luminance(tone.text)].sort(
      (a, b) => b - a,
    );
    expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
  },
);
