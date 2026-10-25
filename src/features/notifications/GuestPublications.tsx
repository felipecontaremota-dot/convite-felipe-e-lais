import { useState } from "react";
import { Text } from "react-native";
import { Button, Card, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { notificationFeed } from "../../repositories/api";
import type { NotificationPublication } from "../../types/domain";
import { publicationCaption } from "./publication";
export function GuestPublications() {
  const app = useApp(),
    feedback = useFeedback();
  const [older, setOlder] = useState<NotificationPublication[]>([]),
    [end, setEnd] = useState(false),
    [busy, setBusy] = useState(false);
  const first = app.data?.notification_publications || [],
    items = [
      ...new Map([...first, ...older].map((p) => [p.id, p])).values(),
    ].sort(
      (a, b) =>
        b.published_at.localeCompare(a.published_at) ||
        b.id.localeCompare(a.id),
    );
  return (
    <>
      {items.map((p) => (
        <Card key={p.id}>
          <Text style={styles.small}>{publicationCaption(p.published_at)}</Text>
          <Text style={styles.heading}>{p.title}</Text>
          <Text style={styles.text}>{p.content}</Text>
          {!p.viewer_read_at ? (
            <Button
              secondary
              title="Marcar recado como lido"
              onPress={() =>
                feedback.run(async () => {
                  const result = await app.send("MESSAGE_READ", { id: p.id });
                  if (result !== "Sincronizado com sucesso.") return result;
                  setOlder((rows) =>
                    rows.map((x) =>
                      x.id === p.id
                        ? { ...x, viewer_read_at: new Date().toISOString() }
                        : x,
                    ),
                  );
                  return "Leitura registrada.";
                })
              }
            />
          ) : (
            <Text style={styles.small}>Lido pela sua unidade</Text>
          )}
        </Card>
      ))}
      {!end && first.length === 20 ? (
        <Button
          secondary
          title="Carregar recados anteriores"
          disabled={busy}
          onPress={() =>
            feedback.run(async () => {
              setBusy(true);
              try {
                const last = items[items.length - 1]!,
                  rows = await notificationFeed(last.published_at, last.id);
                setOlder((v) => [...v, ...rows]);
                setEnd(rows.length < 20);
                return "";
              } finally {
                setBusy(false);
              }
            })
          }
        />
      ) : null}
      {feedback.node}
    </>
  );
}
