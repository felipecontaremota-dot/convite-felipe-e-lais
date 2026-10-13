import type { ExpoConfig } from "expo/config";
import { getWebBasePath } from "./config/web-paths.cjs";
const domain = process.env.EXPO_PUBLIC_WEB_BASE_URL;
const host = domain ? new URL(domain).hostname : undefined;
if (
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
    process.env.EXPO_PUBLIC_EVENT_ID || "",
  )
)
  throw new Error("Configure EXPO_PUBLIC_EVENT_ID para este ambiente.");
const config: ExpoConfig = {
  name: "Felipe & Laís",
  slug: "convite-felipe-e-lais",
  version: "1.0.0",
  scheme: "felipeelais",
  icon: "./assets/branding/icon.png",
  orientation: "default",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID || "com.felipeelais.convite",
    supportsTablet: true,
    infoPlist: {
      LSApplicationQueriesSchemes: ["comgooglemaps", "waze", "uber"],
    },
    ...(host ? { associatedDomains: [`applinks:${host}`] } : {}),
  },
  android: {
    package: process.env.ANDROID_PACKAGE_ID || "com.felipeelais.convite",
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
  web: {
    bundler: "metro",
    output: "single",
    name: "Felipe & Laís",
    favicon: "./assets/aliancas-felipe-e-lais.png",
  },
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
