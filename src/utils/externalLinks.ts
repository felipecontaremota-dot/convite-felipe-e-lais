import { Linking, Share, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { safeHttps } from "./security";
import { ValidationError } from "../lib/errors";
export async function openExternal(url: string | null) {
  const safe = safeHttps(url);
  if (!safe) throw new ValidationError("Este link ainda não está disponível.");
  await Linking.openURL(safe);
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
