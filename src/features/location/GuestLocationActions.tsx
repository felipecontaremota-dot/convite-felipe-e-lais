import { useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import { Button, styles, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { openExternal } from "../../utils/externalLinks";
import { locationChoices, openDeviceLocation } from "./locationNavigation";

export function GuestLocationActions({ event }: { event?: WeddingEvent }) {
  const [choosing, setChoosing] = useState(false);
  const feedback = useFeedback();
  const choices = event ? locationChoices(event) : [];
  return (
    <>
      <Button
        title="Abrir localização"
        disabled={!choices.length}
        onPress={() =>
          feedback.run(async () => {
            const result = await openDeviceLocation(
              event!,
              Platform.OS,
              (url) => Linking.openURL(url),
            );
            setChoosing(result === "choose");
            return result === "choose"
              ? "Escolha uma opção de localização abaixo."
              : "Localização aberta.";
          })
        }
      />
      {Platform.OS !== "web" && choices.length ? (
        <Button
          secondary
          title="Escolher outro mapa"
          onPress={() => setChoosing(!choosing)}
        />
      ) : null}
      {choosing ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.small}>
            Escolha como abrir o endereço. A abertura de um aplicativo depende
            do dispositivo; os links também oferecem acesso pelo navegador.
          </Text>
          {choices.map((choice) => (
            <Button
              key={choice.label}
              secondary
              title={choice.label}
              onPress={() =>
                feedback.run(async () => {
                  await openExternal(choice.url);
                  return "Link de localização aberto.";
                })
              }
            />
          ))}
        </View>
      ) : null}
      {feedback.node}
    </>
  );
}
