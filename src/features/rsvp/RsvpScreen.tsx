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

import { effectiveRsvpStatus } from "./domain";
import { RsvpFeedback } from "./RsvpFeedback";

function RsvpForm({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const record = app.data?.rsvps.find((r) => r.guest_id === guest.id);
  const [status, setStatus] = useState<RSVP>(effectiveRsvpStatus(record)),
    [dietary, setDietary] = useState(record?.dietary || ""),
    [note, setNote] = useState(record?.note || "");
  const [editing, setEditing] = useState(
      !(record?.responded_at || (record && record.status !== "PENDING")),
    ),
    [busy, setBusy] = useState(false),
    [celebrate, setCelebrate] = useState<RSVP | null>(null);
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      {editing ? (
        <>
          <Choice
            value={status}
            disabled={busy}
            onChange={setStatus}
            options={[
              { value: "CONFIRMED", label: "Irei" },
              { value: "DECLINED", label: "Não irei" },
              { value: "MAYBE", label: "Ainda decidirei" },
            ]}
          />
          <Field
            label={`Restrição alimentar de ${guest.name}`}
            value={dietary}
            editable={!busy}
            onChangeText={setDietary}
          />
          <Field
            label={`Observação de ${guest.name}`}
            value={note}
            editable={!busy}
            onChangeText={setNote}
            multiline
          />
          <Button
            title={
              status === "CONFIRMED"
                ? `Confirmar presença de ${guest.name}`
                : status === "DECLINED"
                  ? `Confirmar ausência de ${guest.name}`
                  : "Confirmar que decidirei"
            }
            disabled={busy || status === "PENDING"}
            onPress={() =>
              feedback.run(async () => {
                setBusy(true);
                setCelebrate(null);
                try {
                  const result = await app.send("RSVP_UPDATE", {
                    guest_id: guest.id,
                    ...rsvpSchema.parse({ status, dietary, note }),
                  });
                  if (app.online) {
                    setEditing(false);
                    setCelebrate(status);
                    return "Confirmação salva.";
                  }
                  return result;
                } finally {
                  setBusy(false);
                }
              })
            }
          />
        </>
      ) : (
        <>
          <Text style={styles.badge}>
            {effectiveRsvpStatus(record) === "CONFIRMED"
              ? "Presença confirmada"
              : effectiveRsvpStatus(record) === "DECLINED"
                ? "Ausência confirmada"
                : "Ainda decidirei"}
          </Text>
          <Button
            secondary
            title="Editar confirmação"
            onPress={() => {
              setCelebrate(null);
              setEditing(true);
            }}
          />
        </>
      )}
      {celebrate ? <RsvpFeedback status={celebrate} /> : null}
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
