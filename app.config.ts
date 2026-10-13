import type { ExpoConfig } from "expo/config";
import { getWebBasePath } from "./config/web-paths.cjs";
import { validateEnvironment, currentBranch } from "./config/environments.cjs";
const environment = validateEnvironment(process.env, currentBranch());
const development = environment === "development";
const domain = process.env.EXPO_PUBLIC_WEB_BASE_URL;
const host = domain ? new URL(domain).hostname : undefined;
const config: ExpoConfig = {
  name: development ? "Felipe & Laís DEV" : "Felipe & Laís",
  slug: "convite-felipe-e-lais",
  version: "1.0.0",
  scheme: development ? "felipeelaisdev" : "felipeelais",
  icon: "./assets/branding/icon.png",
  orientation: "default",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID || (development ? "com.felipeelais.convite.develop" : "com.felipeelais.convite"),
    supportsTablet: true,
    infoPlist: {
      LSApplicationQueriesSchemes: ["comgooglemaps", "waze", "uber"],
    },
    ...(host ? { associatedDomains: [`applinks:${host}`] } : {}),
  },
  android: {
    package: process.env.ANDROID_PACKAGE_ID || (development ? "com.felipeelais.convite.develop" : "com.felipeelais.convite"),
    ...(host
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [{ scheme: "https", host, pathPrefix: "/c/" }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
  web: { bundler: "metro", output: "single", name: "Felipe & Laís" },
  experiments: { baseUrl: getWebBasePath() },
  plugins: [
    "expo-router",
    "./plugins/with-map-queries.cjs",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Permitir câmera para ler os convites do casamento?",
        recordAudioAndroid: false,
        microphonePermission: false,
      },
    ],
    "expo-notifications",
  ],
  extra: {
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
};
export default config;
