// Whitespace is not counted as meaningful content; preserve the actual message.
export function messageReady(content: string) {
  return Array.from(content.trim()).filter((c) => !/^\s$/u.test(c)).length >= 5;
}
