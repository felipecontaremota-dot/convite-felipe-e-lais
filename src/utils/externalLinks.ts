import { Linking, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { safeHttps } from "./security";
import { ValidationError } from "../lib/errors";
export async function openExternal(url: string | null) {
  const safe = safeHttps(url);
  if (!safe) throw new ValidationError("Este link ainda não está disponível.");
  await Linking.openURL(safe);
}
export const copyText = (text: string) => Clipboard.setStringAsync(text);
export const shareText = (text: string) => Share.share({ message: text });
