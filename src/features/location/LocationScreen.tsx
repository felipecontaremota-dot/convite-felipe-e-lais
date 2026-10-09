import React, { useState } from "react";
import { Linking, Platform, Text } from "react-native";
import { Button, Card, Screen, styles, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { useApp } from "../../lib/AppProvider";
import { copyText, openExternal, shareText } from "../../utils/externalLinks";
import {
  mapsEmbedUrl,
  nativeMapOptions,
  transportLinks,
} from "./transportLinks";
export function LocationScreen({
  section = "guest",
}: {
  section?: "guest" | "admin";
}) {
  const app = useApp();
  return (
    <Screen section={section} title="Como chegar">
      <LocationCard event={app.data?.event} />
    </Screen>
  );
}
export function LocationCard({ event }: { event?: WeddingEvent }) {
  const feedback = useFeedback();
  const links = event ? transportLinks(event) : null;
  const [expanded, setExpanded] = useState(false),
    [native, setNative] = useState<{ label: string; url: string }[]>([]);
  return (
    <Card>
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
        disabled={!links?.gps && !links?.google && !links?.share}
        onPress={() =>
          feedback.run(async () => {
            if (!event) return;
            if (Platform.OS !== "web")
              setNative(
                await nativeMapOptions(
                  event,
                  Platform.OS === "ios" ? "ios" : "android",
                  Linking.canOpenURL,
                ),
              );
            setExpanded(true);
          })
        }
      />
      {expanded && links ? (
        <>
          {Platform.OS === "web" ? (
            <>
              {links.google ? (
                <Button
                  title="Google Maps"
                  onPress={() => feedback.run(() => openExternal(links.google))}
                />
              ) : null}
              {links.waze ? (
                <Button
                  title="Waze"
                  onPress={() => feedback.run(() => openExternal(links.waze))}
                />
              ) : null}
              {links.uber ? (
                <Button
                  title="Uber"
                  onPress={() => feedback.run(() => openExternal(links.uber))}
                />
              ) : null}
            </>
          ) : (
            native.map((o) => (
              <Button
                key={o.label}
                title={o.label}
                onPress={() => feedback.run(() => Linking.openURL(o.url))}
              />
            ))
          )}
          {links.gps ? (
            <Button
              title="Abrir link de GPS"
              onPress={() => feedback.run(() => openExternal(links.gps))}
            />
          ) : null}
          {Platform.OS !== "web" && !native.length && links.google ? (
            <Button
              title="Abrir mapa no navegador"
              onPress={() => feedback.run(() => openExternal(links.google))}
            />
          ) : null}
          <Button
            secondary
            title="Copiar endereço"
            disabled={!links.share}
            onPress={() =>
              feedback.run(async () => {
                await copyText(links.share!);
                return "Endereço copiado.";
              })
            }
          />
          <Button
            secondary
            title="Compartilhar com 99 / outros aplicativos"
            disabled={!links.share}
            onPress={() =>
              feedback.run(() =>
                shareText(`${links.share}${links.gps ? `\n${links.gps}` : ""}`),
              )
            }
          />
          <Text style={styles.small}>
            Para 99 e outros aplicativos, compartilhe ou copie o endereço e
            escolha o destino no aplicativo. As opções de compartilhamento são
            oferecidas pelo seu dispositivo.
          </Text>
        </>
      ) : null}
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
  const links = transportLinks(event);
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
      {links.google ? (
        <Button
          secondary
          title="Abrir no Google Maps"
          onPress={() => openExternal(links.google)}
        />
      ) : null}
    </Card>
  );
}
