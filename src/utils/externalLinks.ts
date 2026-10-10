import { Linking, Share, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { safeHttps } from "./security";
import { ValidationError } from "../lib/errors";
export async function openExternal(url: string | null) {
  const safe = safeHttps(url);
  if (!safe) throw new ValidationError("Este link ainda não está disponível.");
  if (Platform.OS === "web") {
    const opened = window.open(safe, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  } else await Linking.openURL(safe);
}
export const copyText = (text: string) => Clipboard.setStringAsync(text);
export async function shareText(text: string) {
  if (Platform.OS === "web") {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await copyText(text);
    return "Endereço copiado para compartilhar.";
  }
  await Share.share({ message: text });
}

// Share/chooser delegates to the OS without guessing which navigation apps are installed.
export async function openLocation(address: string | null, url: string | null) {
  const safe = safeHttps(url);
  const message = [address, safe].filter(Boolean).join("\n");
  if (!message)
    throw new ValidationError("Este local ainda não está disponível.");
  if (Platform.OS === "web") {
    if (navigator.share) {
      await navigator.share({
        title: "Local da celebração",
        text: address || undefined,
        url: safe || undefined,
      });
      return;
    }
    await copyText(message);
    return "Localização copiada para abrir no aplicativo de sua preferência.";
  }
  await Share.share({
    message,
    ...(Platform.OS === "ios" && safe ? { url: safe } : {}),
  });
}
