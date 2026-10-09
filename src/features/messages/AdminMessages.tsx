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
import type { Channel } from "../../types/domain";
import { ChannelChoices } from "../notifications/ChannelChoices";
export function AdminMessages() {
  const app = useApp(),
    feedback = useFeedback();
  const [content, setContent] = useState(""),
    [target, setTarget] = useState("ALL"),
    [family, setFamily] = useState(""),
    [guest, setGuest] = useState(""),
    [selected, setSelected] = useState<Channel[]>(["IN_APP"]);
  return (
    <Screen section="admin" title="Recados & conversas">
      <Card>
        <Choice
          value={target}
          onChange={setTarget}
          options={[
            { value: "ALL", label: "Todos" },
            { value: "FAMILY", label: "Família" },
            { value: "GUEST", label: "Pessoa" },
          ]}
        />
        {target !== "ALL" ? (
          <Choice
            value={family}
            onChange={setFamily}
            options={
              app.data?.invitations
                .filter((i) => i.active)
                .map((i) => ({ value: i.id, label: i.name })) || []
            }
          />
        ) : null}
        {target === "GUEST" ? (
          <Choice
            value={guest}
            onChange={setGuest}
            options={
              app.data?.guests
                .filter((g) => g.invitation_id === family)
                .map((g) => ({ value: g.id, label: g.name })) || []
            }
          />
        ) : null}
        <Field
          label="Mensagem dos noivos"
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={4000}
        />
        <ChannelChoices value={selected} onChange={setSelected} />
        <Button
          title="Enviar recado"
          disabled={
            !content.trim() ||
            !selected.length ||
            (target !== "ALL" && !family) ||
            (target === "GUEST" && !guest)
          }
          onPress={() =>
            feedback.run(async () => {
              const result = await app.send("MESSAGE_SEND", {
                content: content.trim(),
                invitation_id: target === "ALL" ? null : family,
                recipient_guest_id: target === "GUEST" ? guest : null,
                channels: selected,
              });
              setContent("");
              return result;
            })
          }
        />
        <Text style={styles.small}>
          Canais externos entram na outbox. Consentimento, configuração e
          resultado do provider determinam a entrega.
        </Text>
        {feedback.node}
      </Card>
      {app.data?.messages.map((m) => (
        <Card key={m.id}>
          <Text style={styles.badge}>
            {m.from_admin
              ? "Enviado pelos noivos"
              : app.data?.invitations.find((i) => i.id === m.invitation_id)
                  ?.name || "Convidado"}
          </Text>
          <Text style={styles.text}>{m.content}</Text>
          {!m.from_admin ? (
            <>
              <Button
                secondary
                title="Responder à família"
                onPress={() => {
                  setTarget("FAMILY");
                  setFamily(m.invitation_id || "");
                }}
              />
              <Button
                secondary
                title="Marcar como lida"
                disabled={!!m.read_at}
                onPress={() =>
                  feedback.run(() => app.admin("MESSAGE_READ", { id: m.id }))
                }
              />
            </>
          ) : null}
        </Card>
      ))}
      {!app.data?.messages.length ? (
        <Empty text="As conversas aparecerão aqui." />
      ) : null}
    </Screen>
  );
}
