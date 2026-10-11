import { describe, it, expect } from "vitest";
import {
  formatProfilePhone,
  profilePhone,
  profileSaveFeedback,
  revocation,
  withRevocation,
} from "../src/features/guests/profileContact";
const contact = {
  email: "",
  whatsapp: "",
  consent_in_app: true,
  consent_push: false,
  consent_email: false,
  consent_whatsapp: false,
};
describe("Profile contact", () => {
  it("preserves legacy mixed permissions until explicit revocation and reactivation", () => {
    expect(revocation(contact)).toBe(false);
    const revoked = withRevocation(contact, true);
    expect(revocation(revoked)).toBe(true);
    expect(withRevocation(revoked, false)).toEqual({
      ...contact,
      communications_revoked: false,
    });
    expect(contact.consent_in_app).toBe(true);
  });
  it("formats progressive typing and deletion without repeating separators", () => {
    const digits = "62999999999";
    const expected = [
      "",
      "(6",
      "(62",
      "(62) 9",
      "(62) 9 9",
      "(62) 9 99",
      "(62) 9 999",
      "(62) 9 9999",
      "(62) 9 9999-9",
      "(62) 9 9999-99",
      "(62) 9 9999-999",
      "(62) 9 9999-9999",
    ];
    for (let n = 0; n <= 11; n++) {
      expect(formatProfilePhone(digits.slice(0, n))).toBe(expected[n]);
      expect(profilePhone(expected[n]!)).toBe(digits.slice(0, n));
    }
    expect(formatProfilePhone("(62) 9 9999-999")).toBe("(62) 9 9999-999");
  });
  it("handles paste, invalid characters, excess and legacy country code", () => {
    for (const value of [
      "62999999999",
      "(62) 9 9999-9999",
      "+55 (62) 9 9999-9999",
      "abc62999999999xyz",
      "62999999999999999",
    ]) {
      expect(formatProfilePhone(value)).toBe("(62) 9 9999-9999");
      expect(profilePhone(value)).toBe("62999999999");
    }
  });
  it("does not claim an offline or failed synchronization succeeded", () => {
    expect(profileSaveFeedback("Sincronizado com sucesso.")).toBe(
      "Salvo com sucesso.",
    );
    const offline =
      "Salvo neste dispositivo. Será sincronizado quando houver conexão.";
    expect(profileSaveFeedback(offline)).toBe(offline);
  });
});
