import { theme } from "./tokens";
import type { RSVP } from "../types/domain";
export const feedbackColors = {
  neutral: {
    background: theme.colors.wash,
    text: theme.colors.muted,
    border: theme.colors.line,
  },
  confirmed: { background: "#E8F5ED", text: "#236746", border: "#C7E7D4" },
  declined: { background: "#FCEDEE", text: "#A33B43", border: "#F0CFD2" },
  child: { background: "#FFF2E5", text: "#99571D", border: "#F3D8BA" },
} as const;
export type FeedbackTone = keyof typeof feedbackColors;
export const rsvpTone = (status: RSVP): FeedbackTone =>
  status === "CONFIRMED"
    ? "confirmed"
    : status === "DECLINED"
      ? "declined"
      : "neutral";
