import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Empty,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Guest, RSVP } from "../../types/domain";
import { rsvpSchema } from "../../utils/security";

function RsvpForm({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const record = app.data?.rsvps.find((r) => r.guest_id === guest.id);
  const [status, setStatus] = useState<RSVP>(record?.status || "PENDING"),
    [dietary, setDietary] = useState(record?.dietary || ""),
    [note, setNote] = useState(record?.note || "");
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      <Choice
        value={status}
        onChange={setStatus}
        options={[
          { value: "CONFIRMED", label: "Vou participar" },
          { value: "DECLINED", label: "Não poderei ir" },
          { value: "PENDING", label: "Ainda vou decidir" },
        ]}
      />
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
        title={`Salvar presença de ${guest.name}`}
        onPress={() =>
          feedback.run(() =>
            app.send("RSVP_UPDATE", {
              guest_id: guest.id,
              ...rsvpSchema.parse({ status, dietary, note }),
            }),
          )
        }
      />
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
