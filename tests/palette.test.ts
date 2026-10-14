import { describe, it, expect } from "vitest";
import { colors } from "../src/theme/palette";
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const s = parseInt(v, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0] + 0.05) / (l[1] + 0.05);
}
describe("semantic palette accessibility", () => {
  it.each([
    [colors.countdownAccent, colors.paper],
    [colors.countdownAccent, colors.card],
    [colors.countdownAccent, colors.wash],
    [colors.ink, colors.paper],
    [colors.ink, colors.card],
    [colors.muted, colors.card],
    [colors.muted, colors.paper],
    [colors.secondary, colors.paper],
    [colors.secondary, colors.wash],
    [colors.card, colors.primary],
    [colors.card, colors.primaryHover],
    [colors.card, colors.primaryActive],
    [colors.error, colors.card],
    [colors.disabledText, colors.disabled],
  ])("normal text %s on %s meets WCAG AA", (text, bg) => {
    expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("input boundaries and focus remain distinguishable", () => {
    expect(contrast(colors.inputBorder, colors.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.focus, colors.paper)).toBeGreaterThanOrEqual(3);
  });
});
