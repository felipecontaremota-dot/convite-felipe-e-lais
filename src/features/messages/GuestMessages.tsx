import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Choice, Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { Select } from "../../components/adminUi";
import { readCache } from "../../storage/driver";
import { category, unreadMessages } from "./conversations";
import { MessageHistory } from "./MessageHistory";
import { useMessageComposer } from "./useMessageComposer";
export function GuestMessages({
  footerOnly = false,
  hideComposer = false,
  tab: selectedTab,
  onTabChange,
}: {
  footerOnly?: boolean;
  hideComposer?: boolean;
  tab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const app = useApp(),
    composer = useMessageComposer();
  const [localTab, setLocalTab] = useState("private"),
    [content, setContent] = useState(""),
    [sender, setSender] = useState("");
  const tab = selectedTab ?? localTab,
    setTab = onTabChange ?? setLocalTab;
  useEffect(() => {
    let active = true;
    void readCache<string>(`identity:${app.scope}`).then((v) => {
      if (active && v) setSender(v);
    });
    return () => {
      active = false;
    };
  }, [app.scope]);
  const form = (
    <View style={{ gap: 8 }}>
      <Select
        label="Quem está enviando"
        value={sender}
        onChange={setSender}
        options={[
          { value: "", label: "Família / não identificado" },
          ...(app.data?.guests || []).map((g) => ({
            value: g.id,
            label: g.name,
          })),
        ]}
      />
      <Field
        label="Mensagem aos noivos"
        hideLabel={footerOnly}
        placeholder="Escreva uma mensagem para os noivos"
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={4000}
        style={[
          styles.input,
          { minHeight: 90, maxHeight: 120, textAlignVertical: "top" },
        ]}
      />
      <Button
        title={composer.busy ? "Enviando…" : "Enviar mensagem"}
        disabled={composer.busy || !content.trim()}
        onPress={() =>
          void composer.send(
            "MESSAGE_SEND",
            {
              content: content.trim(),
              sender_guest_id: app.data?.guests.some((g) => g.id === sender)
                ? sender
                : null,
            },
            () => setContent(""),
          )
        }
      />
      {composer.node}
      {app.pending
        .filter((m) => m.type === "MESSAGE_SEND" || m.type === "MESSAGE_REPLY")
        .map((m) => (
          <Text key={m.mutationId} style={styles.small}>
            {String(m.payload.content)} ·{" "}
            {m.lastError
              ? "Falha de sincronização — mensagem pendente"
              : "Pendente de sincronização"}
          </Text>
        ))}
    </View>
  );
  if (footerOnly) return tab === "private" ? form : null;
  return (
    <>
      <Text style={styles.small}>
        Conversa privada da sua unidade de acesso com Felipe e Laís. O
        cerimonial não tem acesso.
      </Text>
      <Choice
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "general",
            label: `Mensagens gerais${unreadMessages(app.data, "general") ? ` (${unreadMessages(app.data, "general")})` : ""}`,
          },
          {
            value: "private",
            label: `Nossa conversa${unreadMessages(app.data, "private") ? ` (${unreadMessages(app.data, "private")})` : ""}`,
          },
        ]}
      />
      <MessageHistory
        messages={(app.data?.messages || []).filter((m) => category(m) === tab)}
      />
      {tab === "private" ? (
        !hideComposer ? (
          form
        ) : null
      ) : (
        <Text style={styles.small}>
          Para conversar em particular, abra Nossa conversa.
        </Text>
      )}
    </>
  );
}
