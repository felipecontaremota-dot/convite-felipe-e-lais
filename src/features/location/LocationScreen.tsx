import { Text } from "react-native";
import { Button, Card, Screen, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { copyText, openExternal, shareText } from "../../utils/externalLinks";
import { transportLinks } from "../location/transportLinks";

export function LocationScreen({
  section = "guest",
}: {
  section?: "guest" | "admin";
}) {
  const app = useApp(),
    feedback = useFeedback();
  const event = app.data?.event;
  const links = event
    ? transportLinks(event)
    : { google: null, waze: null, share: null };
  return (
    <Screen section={section} title="Como chegar">
      <Card>
        <Text style={styles.heading}>
          {event?.venue_name || "Local a definir"}
        </Text>
        <Text style={styles.text}>
          {event?.address ||
            "O endereço será informado aqui quando estiver confirmado."}
        </Text>
        <Button
          title="Google Maps"
          disabled={!links.google}
          onPress={() => feedback.run(() => openExternal(links.google))}
        />
        <Button
          title="Waze"
          disabled={!links.waze}
          onPress={() => feedback.run(() => openExternal(links.waze))}
        />
        <Button
          secondary
          title="Copiar endereço"
          disabled={!links.share}
          onPress={() =>
            feedback.run(async () => {
              await copyText(links.share!);
              return "Endereço copiado.";
            })
          }
        />
        <Button
          secondary
          title="Compartilhar localização / Uber / 99 / outros"
          disabled={!links.share}
          onPress={() => feedback.run(() => shareText(links.share!))}
        />
        <Text style={styles.small}>
          Para Uber e 99, copie ou compartilhe o destino e informe-o no
          aplicativo de transporte.
        </Text>
        {feedback.node}
      </Card>
    </Screen>
  );
}
