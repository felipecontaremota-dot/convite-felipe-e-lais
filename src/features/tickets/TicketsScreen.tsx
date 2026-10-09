import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Button,
  Card,
  Empty,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Guest, Ticket } from "../../types/domain";

function TicketCard({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const issueTicket = app.ticket;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  useEffect(() => {
    let active = true;
    void issueTicket(guest.id)
      .then((t) => {
        if (active) setTicket(t);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [guest.id, issueTicket]);
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      {ticket ? (
        <View
          style={{ alignItems: "center", padding: 12 }}
          accessibilityLabel={`Ingresso individual de ${guest.name}`}
        >
          <QRCode value={`wedding://ticket/${ticket.token}`} size={190} />
        </View>
      ) : (
        <Text style={styles.text}>
          Emita o ingresso conectado para salvá-lo neste aparelho.
        </Text>
      )}
      <Text style={styles.small}>
        O QR contém apenas uma credencial aleatória. Um ingresso regenerado
        invalida o anterior.
      </Text>
      <Button
        title={ticket ? "Regenerar ingresso" : "Emitir ingresso"}
        onPress={() =>
          feedback.run(async () => {
            setTicket(await app.ticket(guest.id, !!ticket));
            return "Ingresso salvo neste dispositivo.";
          })
        }
      />
      {feedback.node}
    </Card>
  );
}

export function TicketsScreen() {
  const app = useApp();
  const guests =
    app.data?.guests.filter((g) =>
      app.data?.rsvps.some(
        (r) => r.guest_id === g.id && r.status === "CONFIRMED",
      ),
    ) || [];
  return (
    <Screen section="guest" title="Meus ingressos">
      <Text style={styles.text}>
        Um QR individual por pessoa confirmada, inclusive crianças. Abra os
        ingressos antes do evento para guardar uma cópia offline.
      </Text>
      {guests.map((g) => (
        <TicketCard key={g.id} guest={g} />
      ))}
      {!guests.length ? (
        <Empty text="Confirme a presença para disponibilizar os ingressos." />
      ) : null}
    </Screen>
  );
}
