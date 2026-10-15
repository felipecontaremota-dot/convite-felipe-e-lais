import { useState } from "react";
import { Text, View } from "react-native";
import { Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { MessageHistory } from "./MessageHistory";
import { useMessageComposer } from "./useMessageComposer";
import { SendMessageButton } from "./SendMessageButton";
export function GuestMessages({
  footerOnly = false,
  hideComposer = false,
}: {
  footerOnly?: boolean;
  hideComposer?: boolean;
}) {
  const app = useApp(),
    composer = useMessageComposer({ quietSuccess: true });
  const [content, setContent] = useState("");
  const form = (
    <View style={{ gap: 8 }}>
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
      <SendMessageButton
        busy={composer.busy}
        disabled={!content.trim()}
        onPress={() =>
          void composer.send(
            "MESSAGE_SEND",
            { content: content.trim(), sender_guest_id: null },
            () => setContent(""),
          )
        }
      />
      {composer.node}
      {app.pending
        .filter((m) => m.type === "MESSAGE_SEND")
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
  if (footerOnly) return form;
  return (
    <>
      <MessageHistory messages={app.data?.messages || []} />
      {!hideComposer ? form : null}
    </>
  );
}
