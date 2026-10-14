import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { IconButton } from "../../components/adminUi";
import { Button, Empty, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { theme } from "../../theme/tokens";
import type { Message } from "../../types/domain";
import { chronological, isUnread } from "./conversations";
function Bubble({
  message: m,
  onDelete,
}: {
  message: Message;
  onDelete?: (m: Message) => void;
}) {
  const app = useApp(),
    node = useRef<View>(null),
    lock = useRef(false);
  const [readError, setReadError] = useState(false);
  const unread = !!app.data && isUnread(m, app.data);
  const read = async () => {
    if (
      lock.current ||
      (Platform.OS === "web" && document.visibilityState !== "visible") ||
      !app.online ||
      !unread ||
      !app.data?.capabilities?.messaging_v2
    )
      return;
    lock.current = true;
    setReadError(false);
    try {
      if (app.data.role === "ADMIN")
        await app.admin("MESSAGE_READ", { id: m.id });
      else await app.send("MESSAGE_READ", { id: m.id });
    } catch {
      lock.current = false;
      setReadError(true);
    }
  };
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !unread ||
      !app.online ||
      !app.data?.capabilities?.messaging_v2 ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const element = node.current as unknown as HTMLElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (timer) clearTimeout(timer);
        if (
          entry?.isIntersecting &&
          entry.intersectionRatio >= 0.6 &&
          document.visibilityState === "visible"
        )
          timer = setTimeout(() => void read(), 400);
      },
      { threshold: [0, 0.6, 1] },
    );
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
    // read is scoped to this exact rendered message and confirmed snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, unread, app.online, app.data?.capabilities?.messaging_v2]);
  const own = m.from_admin === (app.data?.role === "ADMIN");
  return (
    <View
      ref={node}
      testID="conversation-message"
      style={{
        alignSelf: own ? "flex-end" : "flex-start",
        maxWidth: "94%",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: own ? theme.colors.wash : theme.colors.card,
        padding: 12,
        gap: 6,
      }}
    >
      <Text style={styles.badge}>
        {m.from_admin
          ? "Felipe & Laís"
          : app.data?.guests.find((g) => g.id === m.sender_guest_id)?.name ||
            "Sua família"}
      </Text>
      {m.audience === "FAMILY" ? (
        <Text style={styles.small}>Recado para a família</Text>
      ) : null}
      {m.notification_title ? (
        <Text style={styles.heading}>{m.notification_title}</Text>
      ) : null}
      <Text selectable style={[styles.text, { color: theme.colors.ink }]}>
        {m.notification_title &&
        m.content.startsWith(m.notification_title + "\n")
          ? m.content.slice(m.notification_title.length + 1)
          : m.content}
      </Text>
      <Text style={styles.small}>
        {new Date(m.created_at).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })}
        {unread
          ? " · Não lida"
          : m.viewer_read_at
            ? app.data?.role === "GUEST"
              ? " · Visualizada na sua unidade"
              : " · Lida por você"
            : app.data?.role === "ADMIN" && m.legacy_admin_read_at
              ? " · Leitura histórica compartilhada"
              : ""}
      </Text>
      {unread && app.data?.capabilities?.messaging_v2 ? (
        <Button
          secondary
          title="Marcar como lida"
          disabled={!app.online}
          onPress={() => void read()}
        />
      ) : null}
      {readError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Não foi possível confirmar a leitura. Tente novamente.
        </Text>
      ) : null}
      {onDelete && m.from_admin ? (
        <IconButton
          icon="delete"
          label="Excluir mensagem"
          onPress={() => onDelete(m)}
        />
      ) : null}
    </View>
  );
}
export function MessageHistory({
  messages,
  onDelete,
}: {
  messages: Message[];
  onDelete?: (m: Message) => void;
}) {
  const ordered = chronological(messages);
  return (
    <View style={{ gap: 12 }}>
      {Platform.OS === "web" ? (
        <style>{`
        [data-testid="conversation-message"] { animation: wedding-message-enter 220ms ease-out both; }
        @keyframes wedding-message-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [data-testid="conversation-message"] { animation: none; } }
      `}</style>
      ) : null}
      {ordered.map((m) => (
        <Bubble key={m.id} message={m} onDelete={onDelete} />
      ))}
      {!ordered.length ? (
        <Empty text="Ainda não há mensagens nesta conversa." />
      ) : null}
    </View>
  );
}
