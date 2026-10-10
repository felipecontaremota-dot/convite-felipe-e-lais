import { normalizePhone } from "./security";
export function brazilPhone(value: string) {
  const digits = normalizePhone(value);
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
}
export function formatPhone(value: string) {
  const p = brazilPhone(value);
  // Do not silently truncate a pasted/legacy phone; validation must reject it.
  if (p.length > 11) return value;
  if (!p) return "";
  if (p.length < 3) return `(${p}`;
  const prefix = `(${p.slice(0, 2)}) `;
  const rest = p.slice(2);
  if (rest.length <= 8)
    return (
      prefix + rest.slice(0, 4) + (rest.length > 4 ? "-" + rest.slice(4) : "")
    );
  return (
    prefix + rest.slice(0, 1) + " " + rest.slice(1, 5) + "-" + rest.slice(5)
  );
}
