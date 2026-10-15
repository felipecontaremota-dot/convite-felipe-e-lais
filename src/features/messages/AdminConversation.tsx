import { useState } from "react";
import { View, Text } from "react-native";
import { Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Message } from "../../types/domain";
import { ChatWindow } from "./ChatWindow";
import { MessageHistory } from "./MessageHistory";
import { unitMessages } from "./conversations";
import { useMessageComposer } from "./useMessageComposer";
import { SendMessageButton } from "./SendMessageButton";
export function AdminReplyComposer({
  invitation,
  anchor,
  blocked = false,
}: {
  invitation: string;
  anchor?: Message;
  blocked?: boolean;
}) {
  const app = useApp(),
    composer = useMessageComposer({ quietSuccess: true });
  const [content, setContent] = useState("");
  const unit = app.data?.invitations.find((i) => i.id === invitation);
  const enabled = !!app.data?.capabilities?.messaging_v2;
  const recipients = (app.data?.guests || [])
    .filter((g) => g.invitation_id === invitation)
    .map((g) => g.id);
  return (
    <View style={{ gap: 8 }}>
      {blocked ? (
        <Text style={styles.error}>
          A mensagem selecionada não está mais disponível.
        </Text>
      ) : null}
      {!enabled ? (
        <Text accessibilityRole="alert" style={styles.small}>
          Respostas e exclusão ainda não estão disponíveis neste ambiente. O
          backend de mensagens precisa ser atualizado.
        </Text>
      ) : null}
      <Field
        label="Resposta dos noivos"
        hideLabel
        placeholder="Escreva uma resposta"
        multiline
        maxLength={4000}
        value={content}
        onChangeText={setContent}
        style={[
          styles.input,
          { minHeight: 90, maxHeight: 120, textAlignVertical: "top" },
        ]}
      />
      <SendMessageButton
        label="Enviar resposta"
        busy={composer.busy}
        disabled={
          blocked ||
          !enabled ||
          !content.trim() ||
          !unit?.active ||
          !!unit.archived_at ||
          !recipients.length ||
          recipients.length > 500
        }
        onPress={() =>
          void composer.send(
            anchor ? "MESSAGE_REPLY" : "MESSAGE_SEND_TO_GUESTS",
            anchor
              ? {
                  message_id: anchor.id,
                  content: content.trim(),
                  channels: ["IN_APP"],
                }
              : {
                  content: content.trim(),
                  recipient_guest_ids: recipients,
                  channels: ["IN_APP"],
                  audience: "FAMILY",
                  create_announcement: false,
                },
            () => setContent(""),
          )
        }
      />
      {composer.node}
      {app.pending
        .filter(
          (m) =>
            m.type === "MESSAGE_REPLY" && m.payload.message_id === anchor?.id,
        )
        .map((m) => (
          <Text key={m.mutationId} style={styles.small}>
            {String(m.payload.content)} ·{" "}
            {m.lastError
              ? "Falha de sincronização — resposta pendente"
              : "Pendente de sincronização"}
          </Text>
        ))}
    </View>
  );
}
export function AdminConversation({
  anchor,
  onClose,
  onDelete,
}: {
  anchor: Message;
  onClose: () => void;
  onDelete: (m: Message) => void;
}) {
  const app = useApp();
  const unit = app.data?.invitations.find((i) => i.id === anchor.invitation_id);
  return (
    <ChatWindow
      title={unit?.name || "Conversa"}
      onClose={onClose}
      footer={
        <AdminReplyComposer
          invitation={anchor.invitation_id || ""}
          anchor={anchor}
        />
      }
    >
      <MessageHistory
        messages={
          app.data && anchor.invitation_id
            ? unitMessages(app.data, anchor.invitation_id)
            : []
        }
        onDelete={onDelete}
      />
    </ChatWindow>
  );
}
