import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Guest, RSVP } from "../../types/domain";
import { rsvpSchema } from "../../utils/security";
import {
  confirmationLabels,
  effectiveResponse,
  presenceChoices,
  responseMessages,
} from "./presenceContent";

function RsvpForm({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const record = app.data?.rsvps.find((r) => r.guest_id === guest.id);
  const response = effectiveResponse(guest.id, record, app.pending);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<RSVP>(response.status),
    [dietary, setDietary] = useState(response.dietary),
    [note, setNote] = useState(response.note);
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      {response.answered && !editing ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {responseMessages[response.status]}
          </Text>
          <Button
            secondary
            title="Editar minha confirmação"
            onPress={() => {
              setStatus(response.status);
              setDietary(response.dietary);
              setNote(response.note);
              setEditing(true);
            }}
          />
        </>
      ) : (
        <>
          <View style={styles.row}>
            {presenceChoices.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: status === option.value }}
                aria-checked={status === option.value}
                onPress={() => setStatus(option.value)}
                style={[
                  styles.nav,
                  { maxWidth: "100%", justifyContent: "center" },
                  status === option.value && styles.selected,
                ]}
              >
                <Text
                  style={[
                    styles.text,
                    status === option.value && styles.selectedText,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label={`Restrição alimentar de ${guest.name}`}
            value={dietary}
            onChangeText={setDietary}
          />
          <Field
            label={`Observação de ${guest.name}`}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Button
            title={confirmationLabels[status]}
            onPress={() =>
              feedback.run(async () => {
                const result = await app.send("RSVP_UPDATE", {
                  guest_id: guest.id,
                  ...rsvpSchema.parse({ status, dietary, note }),
                });
                setEditing(false);
                return result;
              })
            }
          />
        </>
      )}
      {feedback.node}
    </Card>
  );
}

export function RsvpScreen() {
  const app = useApp();
  return (
    <Screen section="guest" title="Sua presença faz parte da nossa história">
      <Text style={styles.text}>
        Responda por cada integrante. A confirmação é diferente da entrada no
        dia do evento.
      </Text>
      {app.data?.guests.map((g) => (
        <RsvpForm key={g.id} guest={g} />
      ))}
      {!app.data?.guests.length ? (
        <Empty text="Seu convite ainda não possui integrantes." />
      ) : null}
    </Screen>
  );
}
