import { Text } from "react-native";
import { Button, Card, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { usePublicationPages } from "./usePublicationPages";
import { publicationCaption } from "./publication";
export function GuestPublications() {
  const app = useApp(),
    feedback = useFeedback();
  const pages = usePublicationPages(
    app.data?.notification_publications || [],
    app.data?.notification_feed_revision,
  );
  const items = pages.items.filter((p) => !p.deleted_at);
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
                  pages.markRead(p.id);
                  return "Leitura registrada.";
                })
              }
            />
          ) : (
            <Text style={styles.small}>Lido</Text>
          )}
        </Card>
      ))}
      {pages.canLoadMore ? (
        <Button
          secondary
          title="Carregar recados anteriores"
          disabled={pages.loading}
          onPress={() =>
            feedback.run(async () => {
              await pages.loadMore();
              return "";
            })
          }
        />
      ) : null}
      {feedback.node}
    </>
  );
}
