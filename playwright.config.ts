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
  webServer: {
    command:
      "EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY= EXPO_PUBLIC_DEMO_MODE=true CI=1 npm run web -- --port 8081",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
