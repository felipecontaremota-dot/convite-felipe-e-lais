import type { ExpoConfig } from "expo/config";
const domain = process.env.EXPO_PUBLIC_WEB_BASE_URL;
const host = domain ? new URL(domain).hostname : undefined;
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
  web: { bundler: "metro", output: "single", name: "Felipe & Laís" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Permitir câmera para ler os ingressos do casamento?",
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
