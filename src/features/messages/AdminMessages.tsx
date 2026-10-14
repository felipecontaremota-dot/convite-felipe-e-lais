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
import { AdminConversation } from "./AdminConversation";
import { useMessageComposer } from "./useMessageComposer";
import { chronological } from "./conversations";
import { IconButton, Select } from "../../components/adminUi";
import {
  AdminModal,
  SelectedChips,
  ConfirmModal,
} from "../../components/AdminModal";
import { useApp } from "../../lib/AppProvider";
import type { Channel, Message } from "../../types/domain";
import { effectiveRecipients, recipientError } from "./recipients";
import { ChannelChoices } from "../notifications/ChannelChoices";
export function AdminMessages() {
  const app = useApp(),
    feedback = useFeedback();
  const composer = useMessageComposer();
  const [conversation, setConversation] = useState<Message | null>(null),
    [deleting, setDeleting] = useState<Message | null>(null);
  const enhanced = !!app.data?.capabilities?.messaging_v2;
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
  const effectiveRecipientIds = effectiveRecipients(
    people,
    target,
    family,
    guests,
  );
  const validationError = recipientError(target, effectiveRecipientIds.length);
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
        <Text style={styles.small}>
          {validationError || `${effectiveRecipientIds.length} destinatários`}
        </Text>
        <Button
          title={composer.busy ? "Enviando…" : "Enviar recado"}
          disabled={
            composer.busy ||
            !content.trim() ||
            !selected.length ||
            (target === "FAMILY" && !family) ||
            !!validationError
          }
          onPress={() =>
            void composer.send(
              "MESSAGE_SEND_TO_GUESTS",
              {
                content: content.trim(),
                recipient_guest_ids: effectiveRecipientIds,
                create_announcement:
                  target === "ALL" && selected.includes("IN_APP"),
                audience:
                  target === "ALL"
                    ? "GENERAL"
                    : target === "FAMILY"
                      ? "FAMILY"
                      : "INDIVIDUAL",
                channels: selected,
              },
              () => {
                setContent("");
                setGuests([]);
              },
            )
          }
        />
        <Text style={styles.small}>
          Canais externos entram na outbox. Consentimento, configuração e
          resultado do provider determinam a entrega.
        </Text>
        {composer.node}
        {feedback.node}
      </Card>
      {chronological(app.data?.messages || [])
        .reverse()
        .map((m) => (
          <Card key={m.id}>
            <Text style={styles.badge}>
              {m.from_admin
                ? "Enviado pelos noivos"
                : app.data?.invitations.find((i) => i.id === m.invitation_id)
                    ?.name || "Convidado"}
            </Text>
            <Text style={styles.text}>{m.content}</Text>
            <Text style={styles.small}>
              {new Date(m.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </Text>
            {enhanced && m.from_admin ? (
              <IconButton
                icon="delete"
                label="Excluir mensagem"
                onPress={() => setDeleting(m)}
              />
            ) : null}
            {!m.from_admin ? (
              <>
                <Button
                  secondary
                  title="Responder à família"
                  onPress={() => {
                    if (enhanced) setConversation(m);
                    else {
                      setTarget("FAMILY");
                      setFamily(m.invitation_id || "");
                    }
                  }}
                />
                <Button
                  secondary
                  title="Marcar como lida"
                  disabled={
                    enhanced
                      ? !!m.viewer_read_at || !!m.legacy_admin_read_at
                      : !!m.read_at
                  }
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
      {conversation && enhanced ? (
        <AdminConversation
          anchor={conversation}
          onClose={() => setConversation(null)}
          onDelete={setDeleting}
        />
      ) : null}
      {deleting && enhanced ? (
        <ConfirmModal
          title="Excluir mensagem?"
          premium
          text="Tem certeza que deseja excluir esta mensagem? Esta ação não poderá ser desfeita pela interface."
          confirmLabel="Excluir"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await app.admin("MESSAGE_DELETE", { id: deleting.id });
            setDeleting(null);
          }}
        />
      ) : null}
      <Text style={styles.small}>
        Excluir no aplicativo não recupera e-mails ou mensagens já entregues por
        canais externos.
      </Text>
    </Screen>
  );
}
