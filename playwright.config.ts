import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8081",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          args: ["--no-sandbox"],
        }
      : undefined,
  },
  projects: [
    {
      name: "demo",
      testIgnore: ["staff-and-pin.spec.ts", "database-admin.spec.ts"],
    },
    {
      name: "auth",
      testMatch: ["staff-and-pin.spec.ts", "database-admin.spec.ts"],
      use: { baseURL: "http://127.0.0.1:8083" },
    },
  ],
  webServer: [
    {
      command:
        "EXPO_PUBLIC_WEB_BASE_URL=https://example.test/convite-felipe-e-lais EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY= EXPO_PUBLIC_DEMO_MODE=true CI=1 npm run web -- --port 8081",
      url: "http://127.0.0.1:8081",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        "EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=fixture-public-maps-key EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture-public-key EXPO_PUBLIC_WEB_BASE_URL=https://example.test EXPO_PUBLIC_DEMO_MODE=false CI=1 npm run web -- --port 8083",
      url: "http://127.0.0.1:8083",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
