import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useFxToast } from "../../components/FxToastProvider";
import { GuestModal } from "../../components/GuestModal";
import { RsvpFlow } from "./RsvpScreen";

export function HomeRsvpModal({
  onClose,
  returnFocus,
}: {
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const focused = useIsFocused();
  const { reducedMotion } = useFxToast();
  useEffect(() => {
    if (!focused) onClose();
  }, [focused, onClose]);
  // Keep the page locked through FX, reaction and composition, including nested dialogs.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const nodes = [document.documentElement, document.body];
    const previous = nodes.map((node) => node.style.overflow);
    nodes.forEach((node) => {
      node.style.overflow = "hidden";
    });
    return () => {
      nodes.forEach((node, index) => {
        node.style.overflow = previous[index] ?? "";
      });
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !returnFocus.closest("[inert]"))
          returnFocus.focus();
      });
    };
  }, [returnFocus]);
  return (
    <RsvpFlow
      renderContent={(content, blocked) => (
        <GuestModal
          title="Sua presença faz parte da nossa história"
          closeOnOutside
          captureKeyboard
          animationType={
            Platform.OS === "web" || reducedMotion ? "none" : undefined
          }
          dismissible={!blocked}
          onClose={onClose}
        >
          {content}
        </GuestModal>
      )}
    />
  );
}
