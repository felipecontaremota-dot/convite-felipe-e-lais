import { useState } from "react";
import { Image, Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Empty,
  Screen,
  styles,
  Toggle,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { openExternal } from "../../utils/externalLinks";
import { safeHttps } from "../../utils/security";

export function GiftsScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [guest, setGuest] = useState("");
  const effective = guest || app.data?.guests[0]?.id || "";
  return (
    <Screen section="guest" title="Presentes para o nosso próximo capítulo">
      <Text style={styles.text}>
        Sua presença é o nosso maior presente. As sugestões abaixo são
        opcionais; não há pagamento dentro do aplicativo.
      </Text>
      <Choice
        value={effective}
        onChange={setGuest}
        options={
          app.data?.guests.map((g) => ({ value: g.id, label: g.name })) || []
        }
      />
      {app.data?.gifts
        .filter((g) => g.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => (
          <Card key={g.id}>
            {safeHttps(g.image_url) ? (
              <Image
                accessibilityLabel={g.title}
                source={{ uri: safeHttps(g.image_url)! }}
                style={{ width: "100%", height: 180, borderRadius: 12 }}
              />
            ) : null}
            <Text style={styles.heading}>{g.title}</Text>
            <Text style={styles.text}>{g.description}</Text>
            <Text style={styles.badge}>{g.price_label}</Text>
            <Toggle
              label={`Tenho interesse em ${g.title}`}
              value={app.data!.gift_selections.some(
                (x) => x.guest_id === effective && x.gift_id === g.id,
              )}
              onChange={(selected) =>
                void feedback.run(() =>
                  app.send("GIFT_SELECT", {
                    guest_id: effective,
                    gift_id: g.id,
                    selected,
                  }),
                )
              }
            />
            <Button
              title="Abrir sugestão de presente"
              disabled={!safeHttps(g.external_url)}
              onPress={() => feedback.run(() => openExternal(g.external_url))}
            />
          </Card>
        ))}
      {!app.data?.gifts.some((g) => g.active) ? (
        <Empty text="A lista será preparada pelos noivos em breve." />
      ) : null}
      {feedback.node}
    </Screen>
  );
}
