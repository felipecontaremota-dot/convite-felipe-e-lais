import { useIsFocused } from "expo-router";
import { RsvpPresentation } from "./RsvpPresentation";
import { CalendarAction } from "./CalendarAction";
import { useState, useRef, useEffect, type ReactNode } from "react";
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

function RsvpForm({
  guest,
  blocked,
  onStart,
  onComplete,
}: {
  guest: Guest;
  blocked: boolean;
  onStart: () => number | null;
  onComplete: (status: RSVP | null, epoch: number) => void;
}) {
  const savingLock = useRef(false);
  const app = useApp(),
    feedback = useFeedback();
  const record = app.data?.rsvps.find((r) => r.guest_id === guest.id);
  const response = effectiveResponse(guest.id, record, app.pending);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RSVP>(response.status),
    [dietary, setDietary] = useState(response.dietary),
    [note, setNote] = useState(response.note);
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      {response.answered && !editing ? (
        <>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.notice, { textAlign: "center" }]}
          >
            {responseMessages[response.status]}
          </Text>
          <Button
            secondary
            disabled={blocked || saving}
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
                accessibilityState={{
                  checked: status === option.value,
                  disabled: blocked || saving,
                }}
                disabled={blocked || saving}
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
            editable={!blocked && !saving}
            value={dietary}
            onChangeText={setDietary}
          />
          <Field
            label={`Observação de ${guest.name}`}
            editable={!blocked && !saving}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Button
            title={confirmationLabels[status]}
            disabled={blocked || saving}
            onPress={async () => {
              if (savingLock.current) return;
              const epoch = onStart();
              if (epoch === null) return;
              savingLock.current = true;
              let confirmed: RSVP | null = null;
              setSaving(true);
              try {
                await feedback.run(async () => {
                  const result = await app.send("RSVP_UPDATE", {
                    guest_id: guest.id,
                    ...rsvpSchema.parse({ status, dietary, note }),
                  });
                  setEditing(false);
                  if (result === "Sincronizado com sucesso.") {
                    if (!response.answered || response.status !== status)
                      confirmed = status;
                    return "";
                  }
                  return result;
                });
              } finally {
                savingLock.current = false;
                setSaving(false);
                onComplete(confirmed, epoch);
              }
            }}
          />
        </>
      )}
      {feedback.node}
      {response.answered &&
      response.status === "CONFIRMED" &&
      !editing &&
      !saving &&
      app.data ? (
        <CalendarAction event={app.data.event} disabled={blocked} />
      ) : null}
    </Card>
  );
}

export function RsvpScreen() {
  return (
    <Screen section="guest" title="Sua presença faz parte da nossa história">
      <RsvpFlow />
    </Screen>
  );
}

// Both entry points share forms, locks, persistence and the complete presentation.
export function RsvpFlow({
  renderContent,
}: {
  renderContent?: (content: ReactNode, blocked: boolean) => ReactNode;
}) {
  const app = useApp();
  const focused = useIsFocused();
  const generation = useRef(0);
  const lock = useRef(false),
    alive = useRef(true);
  const [blocked, setBlocked] = useState(false);
  const [presentation, setPresentation] = useState<RSVP | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!focused) {
      generation.current++;
      lock.current = false;
      const timer = setTimeout(() => {
        setBlocked(false);
        setPresentation(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [focused]);
  const done = () => {
    lock.current = false;
    setBlocked(false);
    setPresentation(null);
  };
  const content = (
    <>
      <Text style={styles.text}>
        Responda por cada integrante. A confirmação é diferente da entrada no
        dia do evento.
      </Text>
      {app.data?.guests.map((g) => (
        <RsvpForm
          key={g.id}
          guest={g}
          blocked={blocked}
          onStart={() => {
            if (lock.current || !focused) return null;
            lock.current = true;
            setBlocked(true);
            return generation.current;
          }}
          onComplete={(status, epoch) => {
            if (!alive.current || epoch !== generation.current) return;
            if (status) setPresentation(status);
            else done();
          }}
        />
      ))}
      {!app.data?.guests.length ? (
        <Empty text="Seu convite ainda não possui integrantes." />
      ) : null}
    </>
  );
  return (
    <>
      {renderContent ? renderContent(content, blocked) : content}
      {presentation && focused ? (
        <RsvpPresentation
          status={presentation}
          onDone={done}
          aboveModal={!!renderContent}
        />
      ) : null}
    </>
  );
}
