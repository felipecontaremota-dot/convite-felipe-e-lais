import { useState } from "react";
import { Text } from "react-native";
import { Button, Card, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { notificationPreferences } from "../../repositories/api";
import { activateWebPush, pushSupport, unsubscribeWebPush } from "./webPush";
export function NotificationPreferences({ guestId }: { guestId: string }) {
  const app = useApp(),
    feedback = useFeedback(),
    [busy, setBusy] = useState(false),
    [activated, setActivated] = useState(false);
  const contact = app.data?.contacts.find((c) => c.guest_id === guestId),
    config = app.data?.notification_config;
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator;
  const ios =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const standalone =
    typeof window !== "undefined" &&
    (matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const permission = supported ? Notification.permission : "default";
  const change = async (action: string, payload: Record<string, unknown>) => {
    if (app.isDemo)
      throw Error(
        "Preferências reais disponíveis apenas no convite autenticado.",
      );
    await notificationPreferences(action, { guest_id: guestId, ...payload });
    await app.refresh();
  };
  const run = (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    void feedback.run(fn).finally(() => setBusy(false));
  };
  return (
    <Card>
      <Text style={styles.heading}>Notificações do convite</Text>
      <Text style={styles.small}>
        Os recados gerais ficam disponíveis no convite. E-mail e Push são
        opcionais; a autorização é separada do cadastro de contato e pode ser
        revogada aqui.
      </Text>
      <Text style={styles.small}>
        E-mail:{" "}
        {contact?.consent_email && !contact.communications_revoked
          ? "autorizado"
          : "não autorizado"}
        .
      </Text>
      <Button
        secondary
        title={
          contact?.consent_email
            ? "Revogar notificações por e-mail"
            : "Autorizar notificações por e-mail"
        }
        disabled={
          busy ||
          !app.online ||
          !contact?.email ||
          !!contact.communications_revoked
        }
        onPress={() =>
          run(async () => {
            await change("EMAIL", { enabled: !contact?.consent_email });
            return "Preferência de e-mail salva.";
          })
        }
      />
      <Text style={styles.small}>
        {pushSupport({ supported, ios, standalone, permission })}
      </Text>
      {!config?.push_enabled ? (
        <Text style={styles.small}>
          Web Push aguarda configuração e validação segura do serviço.
        </Text>
      ) : null}
      <Button
        secondary
        title={
          activated
            ? "Notificações ativadas neste aparelho"
            : "Ativar Push neste aparelho"
        }
        disabled={
          busy ||
          !supported ||
          permission === "denied" ||
          (ios && !standalone) ||
          !config?.push_enabled ||
          !config.vapid_public ||
          !!contact?.communications_revoked ||
          !app.online
        }
        onPress={() =>
          run(async () => {
            await activateWebPush(config!.vapid_public!, (s) =>
              change("PUSH_REGISTER", s),
            );
            setActivated(true);
            return "Notificações ativadas neste aparelho.";
          })
        }
      />
      <Button
        secondary
        title="Revogar notificações Push"
        disabled={busy || !app.online}
        onPress={() =>
          run(async () => {
            await change("PUSH_REVOKE", {});
            await unsubscribeWebPush();
            setActivated(false);
            return "Push revogado para este integrante.";
          })
        }
      />
      {feedback.node}
    </Card>
  );
}
