import { ValidationError } from "../../lib/errors";
export const WEDDING_START = "2026-12-15T16:00:00-03:00";
export function weddingCountdown(startsAt: string, now = Date.now()) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(startsAt))
    throw new ValidationError("Data deve incluir timezone explícito.");
  const remaining = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(remaining)) throw new ValidationError("Data inválida.");
  if (remaining <= 0)
    return {
      unit: "arrived" as const,
      value: 0,
      text: "Chegou o nosso Sim. ❤️",
    };
  if (remaining > 144 * 3600000) {
    const value = Math.ceil(remaining / 86400000);
    return {
      unit: "days" as const,
      value,
      text: `Faltam ${value} dias até o Sim`,
    };
  }
  const value = Math.ceil(remaining / 3600000);
  return {
    unit: "hours" as const,
    value,
    text: `Faltam ${value} ${value === 1 ? "hora" : "horas"} até o Sim`,
  };
}
