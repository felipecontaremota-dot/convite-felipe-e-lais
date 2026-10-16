import { createElement, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { theme } from "../../theme/tokens";
import { GuestModal } from "../../components/GuestModal";
import { Button, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { openExternal, shareText } from "../../utils/externalLinks";
import { locationChoices } from "./locationNavigation";
export function GuestLocationActions({ event }: { event?: WeddingEvent }) {
  const [choosing, setChoosing] = useState(false);
  const feedback = useFeedback();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!choosing || Platform.OS !== "web") return;
    const nodes = [document.documentElement, document.body];
    const previous = nodes.map((node) => node.style.overflow);
    nodes.forEach((node) => {
      node.style.overflow = "hidden";
    });
    return () => {
      nodes.forEach((node, index) => {
        node.style.overflow = previous[index] ?? "";
      });
      const target = trigger.current;
      requestAnimationFrame(() => {
        if (target?.isConnected && !target.closest("[inert]")) target.focus();
      });
    };
  }, [choosing]);
  const choices = event ? locationChoices(event) : [];
  return (
    <>
      <Button
        title="Abrir localização"
        disabled={!choices.length}
        onPress={() => {
          if (Platform.OS === "web")
            trigger.current = document.activeElement as HTMLElement | null;
          setChoosing(true);
        }}
      />
      {choosing ? (
        <GuestModal
          title="Abrir localização"
          closeOnOutside
          animationType={Platform.OS === "web" ? "none" : undefined}
          onClose={() => setChoosing(false)}
        >
          {Platform.OS === "web" &&
            createElement(
              "style",
              null,
              `
            [role="dialog"][aria-label="Abrir localização"] > div:first-child { min-height: 56px; }
            [role="dialog"][aria-label="Abrir localização"] { box-shadow: 0 16px 44px ${theme.colors.shadow}26; }
            [aria-label="Abrir localização"][data-premium-modal="open"] { animation: location-modal-in 220ms ease-out both; }
            [aria-label="Abrir localização"][data-premium-modal="open"] > * { animation: none; }
            @keyframes location-modal-in { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: scale(1); } }
            @media(prefers-reduced-motion:reduce) { [aria-label="Abrir localização"][data-premium-modal] { animation: none !important; } }
          `,
            )}
          <View style={{ gap: 12 }}>
            {choices.map((choice) => (
              <Button
                key={choice.label}
                secondary
                title={choice.label}
                onPress={() =>
                  feedback.run(async () => {
                    await openExternal(choice.url);
                    return "";
                  })
                }
              />
            ))}
            <Button
              secondary
              title="99"
              disabled={!event?.address}
              onPress={() =>
                feedback.run(
                  async () => (await shareText(event!.address!)) || "",
                )
              }
            />
          </View>
          {feedback.node}
        </GuestModal>
      ) : null}
      {!choosing && feedback.node}
    </>
  );
}
