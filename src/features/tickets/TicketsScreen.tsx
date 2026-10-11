import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button, Card, Empty, Screen, styles } from "../../components/ui";
import { Confirmation } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Ticket } from "../../types/domain";

function TicketCard({
  id,
  name,
  family = false,
  responsible = false,
}: {
  id: string;
  name: string;
  family?: boolean;
  responsible?: boolean;
}) {
  const app = useApp();
  const issue = family ? app.familyTicket : app.ticket;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    void issue(id)
      .then((t) => {
        if (active) setTicket(t);
      })
      .catch(() => {
        if (active) setTicket(null);
      });
    return () => {
      active = false;
    };
  }, [id, issue]);
  return (
    <Card>
      <Text style={styles.badge}>
        {family ? "Convite da família" : "Convite individual"}
      </Text>
      <Text style={styles.heading}>{name}</Text>
      {responsible ? (
        <Text style={styles.small}>Responsável pela família</Text>
      ) : null}
      {ticket ? (
        <View
          style={{
            alignSelf: "center",
            backgroundColor: "white",
            padding: 18,
            marginVertical: 8,
          }}
          accessibilityLabel={`${family ? "Convite familiar" : "Convite individual"} de ${name}`}
        >
          <QRCode
            value={`wedding://${family ? "family-ticket" : "ticket"}/${ticket.token}`}
            size={190}
          />
        </View>
      ) : (
        <Text style={styles.text}>
          Abra conectado para emitir este convite. Se ele já foi emitido em
          outro aparelho, gere um novo convite para salvá-lo neste dispositivo.
        </Text>
      )}
      <Text style={styles.text}>
        {family
          ? "Este é o convite da sua família, use ele para acessar o local no Grande Dia"
          : "Este é o seu convite individual, use ele para acessar o local no Grande Dia"}
      </Text>
      <Button title="Gerar novo convite" onPress={() => setConfirm(true)} />
      {confirm ? (
        <Confirmation
          text="Tem certeza que deseja gerar um novo convite? O antigo será invalidado"
          confirmLabel="Confirmar"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setTicket(await issue(id, true));
            setConfirm(false);
          }}
        />
      ) : null}
    </Card>
  );
}
export function TicketsScreen() {
  const app = useApp(),
    data = app.data;
  const guests =
    data?.guests.filter((g) =>
      data.rsvps.some((r) => r.guest_id === g.id && r.status === "CONFIRMED"),
    ) || [];
  const families =
    data?.invitations.filter(
      (i) =>
        i.kind === "FAMILY" &&
        i.active &&
        !i.archived_at &&
        guests.some((g) => g.invitation_id === i.id),
    ) || [];
  guests.sort(
    (a, b) =>
      Number(families.some((i) => i.primary_guest_id === b.id)) -
        Number(families.some((i) => i.primary_guest_id === a.id)) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  return (
    <Screen section="guest" title="Meus convites">
      {families.map((i) => (
        <TicketCard key={`family:${i.id}`} id={i.id} name={i.name} family />
      ))}
      {guests.length ? (
        <Text style={styles.heading}>Convites individuais</Text>
      ) : null}
      {guests.map((g) => (
        <TicketCard
          key={g.id}
          id={g.id}
          name={g.name}
          responsible={families.some((i) => i.primary_guest_id === g.id)}
        />
      ))}
      {!guests.length ? (
        <Empty text="Confirme a presença para disponibilizar os convites." />
      ) : null}
    </Screen>
  );
}
