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
  Toggle,
  useFeedback,
} from "../../components/ui";
import { AdminModal, SelectedChips } from "../../components/AdminModal";
import { Select } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Channel } from "../../types/domain";
import { ChannelChoices } from "../notifications/ChannelChoices";
export function AdminMessages() {
  const app = useApp(),
    feedback = useFeedback();
  const [content, setContent] = useState(""),
    [target, setTarget] = useState("ALL"),
    [family, setFamily] = useState(""),
    [guests, setGuests] = useState<string[]>([]),
    [picking, setPicking] = useState(false),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Channel[]>(["IN_APP"]);
  const people = (app.data?.guests || [])
    .filter((g) =>
      app.data?.invitations.some(
        (i) => i.id === g.invitation_id && i.active && !i.archived_at,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const toggle = (id: string) =>
    setGuests((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  return (
    <Screen section="admin" title="Recados & conversas">
      <Card>
        <Choice
          value={target}
          onChange={(value) => {
            setTarget(value);
            setFamily("");
            setGuests([]);
          }}
          options={[
            { value: "ALL", label: "Todos" },
            { value: "FAMILY", label: "Família" },
            { value: "GUEST", label: "Pessoa" },
          ]}
        />
        {target === "FAMILY" ? (
          <Select
            label="Selecionar família"
            value={family}
            onChange={setFamily}
            options={[
              { value: "", label: "Selecionar família" },
              ...(app.data?.invitations || [])
                .filter(
                  (i) =>
                    i.active &&
                    !i.archived_at &&
                    (i.kind || "FAMILY") === "FAMILY",
                )
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                .map((i) => ({ value: i.id, label: i.name })),
            ]}
          />
        ) : null}
        {target === "GUEST" ? (
          <>
            <Button
              secondary
              title="Selecionar pessoa(s)"
              onPress={() => setPicking(true)}
            />
            <SelectedChips
              items={people.filter((g) => guests.includes(g.id))}
              onRemove={toggle}
              onClear={() => setGuests([])}
            />
            {picking ? (
              <AdminModal
                title="Selecionar pessoa(s)"
                onClose={() => setPicking(false)}
              >
                <Field
                  label="Buscar pessoa"
                  value={search}
                  onChangeText={setSearch}
                />
                {people
                  .filter((g) =>
                    g.name
                      .toLocaleLowerCase("pt-BR")
                      .includes(search.toLocaleLowerCase("pt-BR")),
                  )
                  .map((g) => (
                    <Toggle
                      key={g.id}
                      label={g.name}
                      value={guests.includes(g.id)}
                      onChange={() => toggle(g.id)}
                    />
                  ))}
                <SelectedChips
                  items={people.filter((g) => guests.includes(g.id))}
                  onRemove={toggle}
                  onClear={() => setGuests([])}
                />
                <Button
                  title="Concluir seleção"
                  onPress={() => setPicking(false)}
                />
              </AdminModal>
            ) : null}
          </>
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
            (target === "FAMILY" && !family) ||
            (target === "GUEST" && (!guests.length || guests.length > 500))
          }
          onPress={() =>
            feedback.run(async () => {
              const result = await app.send(
                target === "GUEST" ? "MESSAGE_SEND_TO_GUESTS" : "MESSAGE_SEND",
                {
                  content: content.trim(),
                  invitation_id: target === "FAMILY" ? family : null,
                  ...(target === "GUEST"
                    ? { recipient_guest_ids: guests }
                    : {}),
                  channels: selected,
                },
              );
              setContent("");
              setGuests([]);
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
