import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
const inspectConfig = (event: string) =>
  execFileSync(
    process.execPath,
    ["--import", "tsx", "-e", "import('./app.config.ts')"],
    {
      env: {
        ...process.env,
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        EXPO_PUBLIC_EVENT_ID: event,
      },
      stdio: "pipe",
    },
  );
it.each(["", "invalid", "not-a-uuid"])(
  "remote/client config rejects missing or invalid event %s",
  (event) => {
    expect(() => inspectConfig(event)).toThrow(/Configure EXPO_PUBLIC_EVENT_ID/);
  },
);
it("the configured event is supplied externally, without an environment fallback", () => {
  expect(() => inspectConfig(randomUUID())).not.toThrow();
});
