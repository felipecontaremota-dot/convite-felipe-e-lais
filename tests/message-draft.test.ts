import { it, expect } from "vitest";
import { messageReady } from "../src/features/messages/messageDraft";
it.each(["", "   ", "a", "abcd", "  abcd  ", "a   b", "a b c"])(
  "rejects insufficient meaningful content: %j",
  (value) => {
    expect(messageReady(value)).toBe(false);
  },
);
it.each(["abcde", "  abcde  ", "Muito amor!", "💙💙💙💙💙"])(
  "accepts meaningful optional message: %j",
  (value) => {
    expect(messageReady(value)).toBe(true);
  },
);
