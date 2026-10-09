import type { Rule } from "../../types/domain";
export const NOTIFICATION_DAYS = [30, 20, 15, 10, 7, 5, 2, 1, 0];
export function notificationTime(startsAt: string, daysBefore: number) {
  if (!Number.isInteger(daysBefore) || daysBefore < 0)
    throw new Error("Prazo inválido");
  return new Date(
    new Date(startsAt).getTime() - daysBefore * 86400000,
  ).toISOString();
}
export function dueRules(rules: Rule[], startsAt: string, now: number) {
  return rules.filter(
    (r) =>
      r.active &&
      new Date(notificationTime(startsAt, r.days_before)).getTime() <= now,
  );
}
