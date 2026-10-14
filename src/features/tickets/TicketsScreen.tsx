import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Button,
  Card,
  Empty,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { Confirmation } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Guest, Ticket } from "../../types/domain";

function TicketCard({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const issueTicket = app.ticket;
  const opener = useRef<HTMLElement | null>(null);
  const closeConfirmation = () => {
    setConfirm(false);
    if (Platform.OS === "web") setTimeout(() => opener.current?.focus(), 0);
  };
  const [confirm, setConfirm] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  useEffect(() => {
    let active = true;
    void issueTicket(guest.id)
      .then((t) => {
        if (active) setTicket(t);
      })
      .catch(() => {
        if (active) setTicket(null);
      });
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
          accessibilityLabel={`Convite individual de ${guest.name}`}
        >
          <QRCode value={`wedding://ticket/${ticket.token}`} size={190} />
        </View>
      ) : null}
      <Text style={styles.small}>
        O convite é individual. Gerar um novo invalida o anterior.
      </Text>
      <Button
        title={ticket ? "Emitir novo convite" : "Emitir neste dispositivo"}
        onPress={() => {
          if (Platform.OS === "web")
            opener.current = document.activeElement as HTMLElement;
          if (
            ticket ||
            app.data?.credentials.some(
              (c) => c.guest_id === guest.id && !c.revoked_at,
            )
          )
            setConfirm(true);
          else
            feedback.run(async () => {
              setTicket(await issueTicket(guest.id));
              return "Convite salvo";
            });
        }}
      />
      {confirm ? (
        <Confirmation
          text="Tem certeza que deseja emitir um novo ingresso? Essa ação irá invalidar o anterior"
          confirmLabel="Confirmar"
          destructive={false}
          onCancel={closeConfirmation}
          onConfirm={async () => {
            setTicket(await issueTicket(guest.id, true));
            closeConfirmation();
            feedback.run(async () => "Convite salvo");
          }}
        />
      ) : null}
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
    <Screen section="guest" title="Meus convites">
      {guests.map((g) => (
        <TicketCard key={g.id} guest={g} />
      ))}
      {!guests.length ? (
        <Empty text="Confirme a presença para disponibilizar os convites." />
      ) : null}
    </Screen>
  );
}
