import { useFxToast } from "../../components/FxToastProvider";
import React from "react";
import { Platform, Text } from "react-native";
import { Button, Card, Screen, styles, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { useApp } from "../../lib/AppProvider";
import { copyText, openExternal } from "../../utils/externalLinks";
import { mapsEmbedUrl, transportLinks } from "./transportLinks";
import { VenueLogo } from "./VenueLogo";
import { GuestLocationActions } from "./GuestLocationActions";
export function LocationScreen({
  section = "guest",
}: {
  section?: "guest" | "admin" | "ceremonial";
}) {
  const app = useApp();
  const toast = useFxToast();
  return (
    <Screen
      section={app.data?.role === "CEREMONIALIST" ? "ceremonial" : section}
      title="Local"
    >
      <LocationCard
        event={app.data?.event}
        onCopied={() => toast.notify("Endereço copiado")}
      />
    </Screen>
  );
}
export function LocationCard({
  event,
  onCopied,
}: {
  event?: WeddingEvent;
  onCopied: () => void;
}) {
  const feedback = useFeedback();
  const links = event ? transportLinks(event) : null;
  return (
    <Card>
      <VenueLogo />
      <Text accessibilityRole="header" style={styles.heading}>
        {event?.venue_name || "Local a definir"}
      </Text>
      <Text style={styles.text}>
        {event?.address ||
          "O endereço será informado aqui quando estiver confirmado."}
      </Text>
      <LocationPreview event={event} />
      <GuestLocationActions event={event} />
      {links?.gps ? (
        <Button
          secondary
          title="Abrir link de GPS"
          onPress={() =>
            feedback.run(async () => {
              await openExternal(links.gps);
              return "";
            })
          }
        />
      ) : null}
      <Button
        secondary
        title="Copiar endereço"
        disabled={!event?.address}
        onPress={() =>
          feedback.run(async () => {
            await copyText(event!.address!);
            onCopied();
            return "";
          })
        }
      />
      {feedback.node}
    </Card>
  );
}

function LocationPreview({ event }: { event?: WeddingEvent }) {
  if (!event) return null;
  const src = mapsEmbedUrl(
    event,
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY,
  );
  return Platform.OS === "web" && src
    ? React.createElement("iframe", {
        title: "Mapa do local da celebração",
        src,
        loading: "lazy",
        referrerPolicy: "strict-origin-when-cross-origin",
        allowFullScreen: true,
        style: { width: "100%", height: 280, border: 0, borderRadius: 12 },
      })
    : null;
}
