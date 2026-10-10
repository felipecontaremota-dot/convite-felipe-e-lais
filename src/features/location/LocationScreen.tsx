import React from "react";
import { Image, Platform, Text } from "react-native";
import { Button, Card, Screen, styles, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { useApp } from "../../lib/AppProvider";
import {
  copyText,
  openExternal,
  openLocation,
} from "../../utils/externalLinks";
import { mapsEmbedUrl, transportLinks } from "./transportLinks";
import { villarejoImage } from "./venueImage";
export function LocationScreen({
  section = "guest",
}: {
  section?: "guest" | "admin";
}) {
  const app = useApp();
  return (
    <Screen section={section} title="Como chegar">
      <LocationCard
        event={app.data?.event}
        systemChooser={section === "guest"}
      />
    </Screen>
  );
}
export function LocationCard({
  event,
  systemChooser = false,
}: {
  event?: WeddingEvent;
  systemChooser?: boolean;
}) {
  const feedback = useFeedback();
  const links = event ? transportLinks(event) : null;
  return (
    <Card>
      {villarejoImage ? (
        <Image
          source={villarejoImage}
          accessibilityLabel="Villarejo Eventos"
          resizeMode="contain"
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignSelf: "center",
          }}
        />
      ) : null}
      <Text accessibilityRole="header" style={styles.heading}>
        {event?.venue_name || "Local a definir"}
      </Text>
      <Text style={styles.text}>
        {event?.address ||
          "O endereço será informado aqui quando estiver confirmado."}
      </Text>
      <LocationPreview event={event} />
      <Button
        title="Abrir localização"
        disabled={!links?.gps && !links?.google}
        onPress={() =>
          feedback.run(() =>
            systemChooser
              ? openLocation(
                  event?.address || null,
                  links?.gps || links?.google || null,
                )
              : openExternal(links?.gps || links?.google || null),
          )
        }
      />
      <Button
        secondary
        title="Abrir no Google Maps"
        disabled={!links?.google}
        onPress={() => feedback.run(() => openExternal(links?.google || null))}
      />
      <Button
        secondary
        title="Copiar endereço"
        disabled={!event?.address}
        onPress={() =>
          feedback.run(async () => {
            await copyText(event!.address!);
            return "Endereço copiado.";
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
  return Platform.OS === "web" && src ? (
    React.createElement("iframe", {
      title: "Mapa do local da celebração",
      src,
      loading: "lazy",
      referrerPolicy: "strict-origin-when-cross-origin",
      allowFullScreen: true,
      style: { width: "100%", height: 280, border: 0, borderRadius: 12 },
    })
  ) : (
    <Card>
      <Text accessibilityLabel="Localização" style={styles.heading}>
        ⌖
      </Text>
      <Text style={styles.text}>
        {event.venue_name || "Local da celebração"}
      </Text>
      <Text style={styles.small}>{event.address || "Endereço a definir"}</Text>
    </Card>
  );
}
