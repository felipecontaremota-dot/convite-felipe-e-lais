import { router } from "expo-router";
import { Text } from "react-native";
import { Button, Card, Empty, Screen, styles } from "../../components/ui";
import { WeddingCountdown } from "../../components/WeddingCountdown";
import { homeGreeting, homePresence } from "./homeContent";
import { useApp } from "../../lib/AppProvider";

export function GuestHome() {
  const app = useApp(),
    s = app.data;
  return (
    <Screen
      section="guest"
      title={homeGreeting(s?.invitations[0], s?.guests ?? [])}
    >
      <Card>
        {s ? <WeddingCountdown startsAt={s.event.starts_at} quoteSim /> : null}
        <Text style={styles.text}>
          15 de dezembro de 2026 · 16h · Horário de Brasília
        </Text>
        <Text style={styles.text}>
          {s?.event.venue_name || "O local será informado pelos noivos."}
        </Text>
        <Text style={styles.badge}>
          {homePresence(
            s?.invitations[0],
            s?.guests ?? [],
            s?.rsvps ?? [],
            app.pending,
          )}
        </Text>
        <Text style={styles.text}>
          {s?.guests.map((g) => g.name).join(" · ")}
        </Text>
        <Button
          secondary
          title="Informar contatos"
          onPress={() => router.push("/perfil")}
        />
        <Button
          title="Confirmar presença"
          onPress={() => router.push("/presenca")}
        />
        <Button
          secondary
          title="Ver meus convites"
          onPress={() => router.push("/ingressos")}
        />
      </Card>
      <Text style={styles.heading}>Recados com carinho</Text>
      {s?.announcements.length ? (
        s.announcements.map((a) => (
          <Card key={a.id}>
            <Text style={styles.heading}>{a.title}</Text>
            <Text style={styles.text}>{a.content}</Text>
          </Card>
        ))
      ) : (
        <Empty text="Os próximos avisos aparecerão aqui." />
      )}
    </Screen>
  );
}
