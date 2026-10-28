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
      testIgnore: [
        "staff-and-pin.spec.ts",
        "database-admin.spec.ts",
        "access-stabilization.spec.ts",
        "profile-confirmation.spec.ts",
        "admin-guest-controls.spec.ts",
        "ceremonial-portal.spec.ts",
        "general-notifications-auth.spec.ts",
        "planning-auth.spec.ts",
        "ticket-devices.spec.ts",
      ],
    },
    {
      name: "auth",
      testMatch: [
        "staff-and-pin.spec.ts",
        "database-admin.spec.ts",
        "access-stabilization.spec.ts",
        "profile-confirmation.spec.ts",
        "admin-guest-controls.spec.ts",
        "ceremonial-portal.spec.ts",
        "general-notifications-auth.spec.ts",
        "planning-auth.spec.ts",
        "ticket-devices.spec.ts",
      ],
      use: { baseURL: "http://127.0.0.1:8083" },
    },
    {
      name: "webkit-tickets",
      testMatch: ["ticket-devices.spec.ts"],
      use: {
        browserName: "webkit",
        baseURL: "http://127.0.0.1:8083",
        launchOptions: {},
      },
    },
    {
      name: "webkit-notifications",
      testMatch: ["general-notifications.spec.ts"],
      use: {
        browserName: "webkit",
        baseURL: "http://127.0.0.1:8081",
        launchOptions: {},
      },
    },
    {
      name: "webkit-party",
      testMatch: ["wedding-party.spec.ts"],
      use: {
        browserName: "webkit",
        baseURL: "http://127.0.0.1:8081",
        launchOptions: {},
      },
    },
  ],
  webServer: [
    {
      command:
        "EXPO_PUBLIC_EVENT_ID=00000000-0000-4000-8000-000000000001 EXPO_PUBLIC_WEB_BASE_URL=https://example.test/convite-felipe-e-lais EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY= EXPO_PUBLIC_DEMO_MODE=true CI=1 npm run web -- --port 8081",
      url: "http://127.0.0.1:8081",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        "EXPO_PUBLIC_EVENT_ID=00000000-0000-4000-8000-000000000001 EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=fixture-public-maps-key EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture-public-key EXPO_PUBLIC_WEB_BASE_URL=https://example.test EXPO_PUBLIC_DEMO_MODE=false CI=1 npm run web -- --port 8083",
      url: "http://127.0.0.1:8083",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
