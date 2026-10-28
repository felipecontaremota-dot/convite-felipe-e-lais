import { describe, expect, it } from "vitest";
import {
  supplierPixCandidate,
  updateSupplierPix,
} from "../src/features/planning/supplierPix";

describe("supplier PIX autofill", () => {
  it.each([
    ["CPF", "tax_id", "529.982.247-25", "52998224725"],
    ["CNPJ", "tax_id", "11.222.333/0001-81", "11222333000181"],
    ["EMAIL", "email", " Case@example.test ", "Case@example.test"],
    ["PHONE", "phone", "(62) 99999-9999", "+5562999999999"],
    ["PHONE", "phone", "(62) 3333-4444", "+556233334444"],
    ["PHONE", "phone", "55 (62) 99999-9999", "+5562999999999"],
    ["PHONE", "phone", "+1 (415) 555-2671", "+14155552671"],
  ])(
    "fills valid %s from %s before or after selecting its type",
    (type, field, source, expected) => {
      expect(
        updateSupplierPix({ [field]: source }, "pix_type", type, false).pix_key,
      ).toBe(expected);
      expect(
        updateSupplierPix({ pix_type: type }, field, source, false).pix_key,
      ).toBe(expected);
    },
  );

  it.each([
    ["CPF", "tax_id", "11111111111"],
    ["CPF", "tax_id", "11222333000181"],
    ["CNPJ", "tax_id", "52998224725"],
    ["CNPJ", "tax_id", "11222333000182"],
    ["PHONE", "phone", "123"],
    ["EMAIL", "email", "invalid"],
    ["EMAIL", "email", ""],
    ["RANDOM", "email", "valid@example.test"],
  ])(
    "does not erase a key for unavailable/invalid %s",
    (type, field, source) => {
      expect(
        supplierPixCandidate({ pix_type: type, [field]: source }),
      ).toBeNull();
      expect(
        updateSupplierPix(
          { pix_type: type, pix_key: "keep" },
          field,
          source,
          false,
        ).pix_key,
      ).toBe("keep");
    },
  );

  it("tracks source changes only until the key is manually edited", () => {
    let values = updateSupplierPix(
      { pix_type: "EMAIL" },
      "email",
      "first@example.test",
      false,
    );
    values = updateSupplierPix(values, "email", "second@example.test", false);
    expect(values.pix_key).toBe("second@example.test");
    values = updateSupplierPix(
      values,
      "pix_key",
      "third-party@example.test",
      true,
    );
    for (const [key, value] of [
      ["email", "new@example.test"],
      ["phone", "62999999999"],
      ["pix_type", "PHONE"],
      ["name", "Supplier"],
    ])
      values = updateSupplierPix(values, key, value, true);
    expect(values.pix_key).toBe("third-party@example.test");
  });

  it("updates an automatic key on a valid type change but preserves it otherwise", () => {
    const values = {
      pix_type: "CPF",
      tax_id: "52998224725",
      pix_key: "52998224725",
      email: "supplier@example.test",
    };
    expect(updateSupplierPix(values, "pix_type", "EMAIL", false).pix_key).toBe(
      values.email,
    );
    expect(updateSupplierPix(values, "pix_type", "CNPJ", false).pix_key).toBe(
      values.pix_key,
    );
    expect(updateSupplierPix(values, "pix_type", "RANDOM", false).pix_key).toBe(
      values.pix_key,
    );
    expect(updateSupplierPix(values, "pix_type", "", false).pix_key).toBe(
      values.pix_key,
    );
  });

  it("preserves saved third-party keys and deliberate manual clearing", () => {
    expect(
      updateSupplierPix(
        { pix_type: "EMAIL", pix_key: "third@example.test" },
        "email",
        "supplier@example.test",
        true,
      ).pix_key,
    ).toBe("third@example.test");
    expect(
      updateSupplierPix(
        { pix_type: "EMAIL", pix_key: "" },
        "email",
        "supplier@example.test",
        true,
      ).pix_key,
    ).toBe("");
  });
});
