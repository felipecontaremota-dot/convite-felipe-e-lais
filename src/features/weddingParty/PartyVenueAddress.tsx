import { createElement } from "react";
import {
  Linking,
  Platform,
  Pressable,
  Text,
  type StyleProp,
  type TextStyle,
} from "react-native";
import type { WeddingEvent } from "../../types/domain";
import { useFeedback } from "../../components/ui";
import { openPartyMap, partyMapLink, partyAddress } from "./content";

export function PartyVenueAddress({
  event,
  style,
}: {
  event?: WeddingEvent;
  style: StyleProp<TextStyle>;
}) {
  const feedback = useFeedback();
  const apple =
    Platform.OS === "ios" ||
    (Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)));
  const url = event ? partyMapLink(event, apple) : null;
  const text = (
    <Text style={style}>
      {partyAddress(event?.address) ||
        "O endereço será informado aqui quando estiver confirmado."}
    </Text>
  );
  if (!event || !url) return text;
  const label = "Abrir localização do Villarejo";
  if (Platform.OS === "web")
    return createElement(
      "a",
      {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": label,
        style: {
          color: "inherit",
          textDecoration: "none",
          display: "block",
          textAlign: "center",
        },
      },
      text,
    );
  return (
    <>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={() =>
          feedback.run(async () => {
            await openPartyMap(event, Platform.OS, Linking.openURL);
            return "";
          })
        }
      >
        {text}
      </Pressable>
      {feedback.node}
    </>
  );
}
