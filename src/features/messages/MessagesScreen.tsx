import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Empty,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";

export function MessagesScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [content, setContent] = useState(""),
    [sender, setSender] = useState("");
  return (
    <Screen section="guest" title="Uma mensagem aos noivos">
      <Card>
        <Text style={styles.text}>
          Conversa privada com Felipe e Laís. O cerimonial não tem acesso.
        </Text>
        <Choice
          value={sender}
          onChange={setSender}
          options={[
            { value: "", label: "Família / não identificado" },
            ...(app.data?.guests.map((g) => ({ value: g.id, label: g.name })) ||
              []),
          ]}
        />
        <Field
          label="Mensagem aos noivos"
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={4000}
        />
        <Button
          title="Enviar mensagem"
          disabled={!content.trim()}
          onPress={() =>
            feedback.run(async () => {
              const result = await app.send("MESSAGE_SEND", {
                content: content.trim(),
                sender_guest_id: sender || null,
              });
              setContent("");
              return result;
            })
          }
        />
        {feedback.node}
      </Card>
      {app.data?.messages.map((m) => (
        <Card key={m.id}>
          <Text style={styles.badge}>
            {m.from_admin ? "Felipe & Laís" : "Sua família"}
          </Text>
          <Text style={styles.text}>{m.content}</Text>
          <Text style={styles.small}>
            {new Date(m.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </Text>
        </Card>
      ))}
      {!app.data?.messages.length ? (
        <Empty text="Escreva o primeiro recado. Estamos felizes em ouvir você." />
      ) : null}
    </Screen>
  );
}
