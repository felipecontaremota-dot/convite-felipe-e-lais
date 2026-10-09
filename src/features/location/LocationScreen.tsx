import { useState } from "react";
import { Linking, Platform, Text } from "react-native";
import { Button, Card, Screen, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { copyText, openExternal, shareText } from "../../utils/externalLinks";
import { nativeMapOptions, transportLinks } from "./transportLinks";
export function LocationScreen({
  section = "guest",
}: {
  section?: "guest" | "admin";
}) {
  const app = useApp(),
    feedback = useFeedback();
  const event = app.data?.event;
  const links = event ? transportLinks(event) : null;
  const [expanded, setExpanded] = useState(false),
    [native, setNative] = useState<{ label: string; url: string }[]>([]);
  return (
    <Screen section={section} title="Como chegar">
      <Card>
        <Text style={styles.heading}>
          {event?.venue_name || "Local a definir"}
        </Text>
        <Text style={styles.text}>
          {event?.address ||
            "O endereço será informado aqui quando estiver confirmado."}
        </Text>
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
                    onPress={() =>
                      feedback.run(() => openExternal(links.google))
                    }
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
                  shareText(
                    `${links.share}${links.gps ? `\n${links.gps}` : ""}`,
                  ),
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
    </Screen>
  );
}
