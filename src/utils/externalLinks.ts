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
export async function copyText(text: string) {
  if (Platform.OS === "web") {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    const focused = document.activeElement;
    try {
      field.select();
      if (!document.execCommand("copy"))
        throw new ValidationError("Não foi possível copiar. Tente novamente.");
      return true;
    } finally {
      field.remove();
      if (focused instanceof HTMLElement) focused.focus();
    }
  }
  const copied = await Clipboard.setStringAsync(text);
  if (copied === false)
    throw new ValidationError("Não foi possível copiar. Tente novamente.");
  return copied;
}
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
