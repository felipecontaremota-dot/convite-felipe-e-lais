import { pixKey } from "./domain";

export function supplierPixCandidate(
  values: Record<string, string>,
): string | null {
  const type = values.pix_type || "";
  let source =
    type === "CPF" || type === "CNPJ"
      ? values.tax_id
      : type === "PHONE"
        ? values.phone
        : type === "EMAIL"
          ? values.email
          : "";
  if (!source?.trim()) return null;
  if (type === "PHONE") {
    source = source.trim().replace(/[()\s-]/g, "");
    // Local Brazilian numbers need DDI; an explicit international DDI is kept.
    if (/^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(source)) source = "+55" + source;
    else if (/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(source))
      source = "+" + source;
  }
  try {
    return pixKey(type, source);
  } catch {
    return null;
  }
}

export function updateSupplierPix(
  values: Record<string, string>,
  key: string,
  value: string,
  manual: boolean,
) {
  const next = { ...values, [key]: value };
  if (!manual && ["pix_type", "tax_id", "phone", "email"].includes(key)) {
    const candidate = supplierPixCandidate(next);
    if (candidate !== null) next.pix_key = candidate;
  }
  return next;
}
