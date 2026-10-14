import { useState } from "react";
import { View, Text } from "react-native";
import { Button, Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Message } from "../../types/domain";
import { ChatWindow } from "./ChatWindow";
import { MessageHistory } from "./MessageHistory";
import { unitMessages } from "./conversations";
import { useMessageComposer } from "./useMessageComposer";
export function AdminConversation({
  anchor,
  onClose,
  onDelete,
}: {
  anchor: Message;
  onClose: () => void;
  onDelete: (message: Message) => void;
}) {
  const app = useApp(),
    composer = useMessageComposer(),
    [content, setContent] = useState("");
  const unit = app.data?.invitations.find((i) => i.id === anchor.invitation_id);
  const footer = (
    <View style={{ gap: 8 }}>
      <Field
        label="Resposta dos noivos"
        multiline
        maxLength={4000}
        value={content}
        onChangeText={setContent}
      />
      <Button
        title={composer.busy ? "Enviando…" : "Enviar resposta"}
        disabled={
          composer.busy ||
          !content.trim() ||
          !unit?.active ||
          !!unit.archived_at
        }
        onPress={() =>
          void composer.send(
            "MESSAGE_REPLY",
            {
              message_id: anchor.id,
              content: content.trim(),
              channels: ["IN_APP"],
            },
            () => setContent(""),
          )
        }
      />
      {composer.node}
      <Text style={styles.small}>
        A resposta é privada para a unidade autorizada; não será publicada para
        todos.
      </Text>
    </View>
  );
  return (
    <ChatWindow
      title={`Conversa com ${unit?.name || "convidado"}`}
      onClose={onClose}
      footer={footer}
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
