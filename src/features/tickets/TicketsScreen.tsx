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
import { AppError, friendlyError } from "../../lib/errors";
import type { Guest, Ticket } from "../../types/domain";

function TicketCard({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const issueTicket = app.ticket;
  const opener = useRef<HTMLElement | null>(null);
  const closeConfirmation = () => {
    setConfirm(null);
    if (Platform.OS === "web") setTimeout(() => opener.current?.focus(), 0);
  };
  const [confirm, setConfirm] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    source: typeof issueTicket;
    attempt: number;
    ticket: Ticket | null;
    error: { message: string; code: string } | null;
  } | null>(null);
  const loaded =
    result?.source === issueTicket && result.attempt === retry ? result : null;
  const loading = !loaded,
    ticket = loaded?.ticket || null,
    error = loaded?.error || null;
  useEffect(() => {
    let active = true;
    void issueTicket(guest.id)
      .then((ticket) => {
        if (active)
          setResult({
            source: issueTicket,
            attempt: retry,
            ticket,
            error: null,
          });
      })
      .catch((cause) => {
        if (active)
          setResult({
            source: issueTicket,
            attempt: retry,
            ticket: null,
            error: {
              message: friendlyError(cause),
              code: cause instanceof AppError ? cause.code : "ERROR",
            },
          });
      });
    return () => {
      active = false;
    };
  }, [guest.id, issueTicket, retry]);
  const replacementRequired = error?.code === "TICKET_REPLACEMENT_REQUIRED";
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
      {loading ? (
        <Text style={styles.small} accessibilityLiveRegion="polite">
          Carregando QR Code...
        </Text>
      ) : null}
      {error ? (
        <Text
          style={replacementRequired ? styles.notice : styles.error}
          accessibilityRole={replacementRequired ? undefined : "alert"}
          accessibilityLiveRegion="polite"
        >
          {error.message}
        </Text>
      ) : null}
      <Text style={styles.small}>
        O convite é individual. Gerar um novo invalida o anterior.
      </Text>
      <Button
        title={
          replacementRequired
            ? "Substituir meu QR Code"
            : ticket
              ? "Emitir novo convite"
              : "Tentar novamente"
        }
        disabled={loading || (!app.online && !ticket)}
        onPress={() => {
          if (Platform.OS === "web")
            opener.current = document.activeElement as HTMLElement;
          if (replacementRequired || ticket) {
            const active =
              app.data?.credentials.filter(
                (c) => c.guest_id === guest.id && !c.revoked_at,
              ) || [];
            if (active.length === 1) setConfirm(active[0]!.id);
            else setRetry((n) => n + 1);
          } else setRetry((n) => n + 1);
        }}
      />
      {confirm ? (
        <Confirmation
          text="Tem certeza que deseja emitir um novo ingresso? Essa ação irá invalidar o anterior"
          confirmLabel="Confirmar"
          destructive={false}
          onCancel={closeConfirmation}
          onConfirm={async () => {
            const next = await issueTicket(guest.id, true, confirm);
            setResult({
              source: issueTicket,
              attempt: retry,
              ticket: next,
              error: null,
            });
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
