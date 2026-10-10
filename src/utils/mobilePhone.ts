import { brazilPhone, formatPhone } from "./phone";
export const mobileDigits = (value: string) => brazilPhone(value).slice(0, 11);
export const mobileMask = (value: string) => formatPhone(mobileDigits(value));

export const validMobile = (value: string) =>
  value === "" || /^[0-9]{11}$/.test(value);
