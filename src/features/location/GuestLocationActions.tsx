import { useState } from "react";
import { View } from "react-native";
import { Button, useFeedback } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { openExternal, shareText } from "../../utils/externalLinks";
import { locationChoices } from "./locationNavigation";
export function GuestLocationActions({ event }: { event?: WeddingEvent }) {
  const [choosing, setChoosing] = useState(false);
  const feedback = useFeedback();
  const choices = event ? locationChoices(event) : [];
  return (
    <>
      <Button
        title="Abrir localização"
        disabled={!choices.length}
        onPress={() => setChoosing(!choosing)}
      />
      {choosing ? (
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
              feedback.run(async () => (await shareText(event!.address!)) || "")
            }
          />
        </View>
      ) : null}
      {feedback.node}
    </>
  );
}
