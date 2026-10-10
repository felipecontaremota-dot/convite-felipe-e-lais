import { useEffect, useState, useCallback } from "react";
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
import { Confirmation } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Ticket } from "../../types/domain";
import {
  guestSchemaMessage,
  hasTicketContract,
} from "../guests/backendContract";
function TicketCard({
  target,
  name,
  family = false,
}: {
  target: string;
  name: string;
  family?: boolean;
}) {
  const app = useApp(),
    feedback = useFeedback();
  const [ticket, setTicket] = useState<Ticket | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const issue = family ? app.familyTicket : app.ticket;
  const load = useCallback(() => issue(target), [issue, target]);
  useEffect(() => {
    let active = true;
    void load()
      .then((t) => {
        if (active) setTicket(t);
      })
      .catch(() => {
        if (active) setTicket(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.heading}>
        {family ? "Convite da família" : `Convite individual — ${name}`}
      </Text>
      {ticket ? (
        <View
          accessible
          accessibilityRole="image"
          style={{ alignItems: "center", padding: 12, maxWidth: "100%" }}
          accessibilityLabel={
            family
              ? "QR do convite da família"
              : `QR do convite individual de ${name}`
          }
        >
          <QRCode
            value={`wedding://${family ? "family" : "ticket"}/${ticket.token}`}
            size={190}
          />
        </View>
      ) : (
        <Text style={styles.text}>
          Conecte-se para disponibilizar o convite. Se ele já foi emitido em
          outro aparelho, gere um novo convite para este dispositivo.
        </Text>
      )}
      <Text style={styles.text}>
        {family
          ? "Este é o convite da sua família, use ele para acessar o local no Grande Dia."
          : "Este é o seu convite individual, use ele para acessar o local no Grande Dia."}
      </Text>
      <Button
        title="Gerar novo convite"
        disabled={!app.online || busy || loading}
        onPress={() => setConfirm(true)}
      />
      {confirm ? (
        <Confirmation
          text="Tem certeza que deseja gerar um novo convite? O antigo será invalidado."
          confirmLabel="Confirmar"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              setTicket(await issue(target, true));
              setConfirm(false);
              await feedback.run(async () => "Novo convite gerado.");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {feedback.node}
    </Card>
  );
}
export function TicketsScreen() {
  const app = useApp(),
    s = app.data,
    unit = s?.invitations[0];
  const ready = hasTicketContract(s);
  const guests =
    s?.guests.filter((g) => s.ticket_guest_ids?.includes(g.id)) || [];
  return (
    <Screen section="guest" title="Meus convites">
      {unit?.kind === "FAMILY" &&
      s?.family_ticket_invitation_ids?.includes(unit.id) ? (
        <TicketCard target={unit.id} name={unit.name} family />
      ) : null}
      {guests.map((g) => (
        <TicketCard key={g.id} target={g.id} name={g.name} />
      ))}
      {!guests.length ? (
        <Empty
          text={
            ready
              ? "Nenhum convite disponível para esta unidade de acesso."
              : guestSchemaMessage
          }
        />
      ) : null}
    </Screen>
  );
}
