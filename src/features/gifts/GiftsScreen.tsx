import { Platform, Pressable, Text } from "react-native";
import { Card, Empty, Screen, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { openExternal } from "../../utils/externalLinks";
import { safeHttps } from "../../utils/security";
import { giftLists } from "./giftLists";

export function GiftsScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const lists = giftLists(app.data?.gifts).filter(
    (g) => g.active && safeHttps(g.external_url),
  );
  return (
    <Screen section="guest" title="Presentes para o nosso próximo capítulo">
      <Text style={styles.text}>
        Sua presença é nosso maior presente... mas fique a vontade para acessar
        nossas listas que preparamos com carinho. Ahhhh, e fica a vontade para
        escolher presentes fora da lista, não tem problema!
      </Text>
      {lists.map((list) => (
        <Card key={list.id}>
          {Platform.OS === "web" ? (
            <a
              href={safeHttps(list.external_url)!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <Text
                style={[styles.heading, { textDecorationLine: "underline" }]}
              >
                {list.title}
              </Text>
            </a>
          ) : (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={list.title}
              accessibilityHint="Abre a lista de presentes na loja externa."
              onPress={() =>
                feedback.run(() => openExternal(list.external_url))
              }
            >
              <Text
                style={[styles.heading, { textDecorationLine: "underline" }]}
              >
                {list.title}
              </Text>
            </Pressable>
          )}
        </Card>
      ))}
      {!lists.length ? (
        <Empty text="A lista será preparada pelos noivos em breve." />
      ) : null}
      {feedback.node}
    </Screen>
  );
}
