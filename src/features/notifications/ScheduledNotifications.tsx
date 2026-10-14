import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Field,
  Toggle,
  styles,
  useFeedback,
} from "../../components/ui";
import { AdminModal, ConfirmModal } from "../../components/AdminModal";
import { Select } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import { id } from "../../repositories/demo";
import type { Channel, NotificationSchedule } from "../../types/domain";
import { ChannelChoices } from "./ChannelChoices";
import { ScheduleDateFields } from "./ScheduleDateFields";
import {
  scheduledInstant,
  scheduleFields,
  scheduledContentError,
} from "./scheduling";
import { effectiveRecipients, recipientError } from "../messages/recipients";
import { scheduleState } from "../messages/conversations";
function Editor({
  record,
  onClose,
}: {
  record: NotificationSchedule | null;
  onClose: () => void;
}) {
  const app = useApp(),
    feedback = useFeedback();
  const [request] = useState(() => record?.id || id()),
    [title, setTitle] = useState(record?.title || ""),
    [body, setBody] = useState(record?.body || ""),
    [date, setDate] = useState(scheduleFields(record?.scheduled_at).date),
    [time, setTime] = useState(scheduleFields(record?.scheduled_at).time),
    [active, setActive] = useState(record?.active ?? true),
    [channels, setChannels] = useState<Channel[]>(
      record?.channels || ["IN_APP"],
    ),
    [target, setTarget] = useState(
      record?.audience === "FAMILY"
        ? "FAMILY"
        : record?.audience === "INDIVIDUAL"
          ? "GUEST"
          : "ALL",
    ),
    [family, setFamily] = useState(record?.invitation_id || ""),
    [selected, setSelected] = useState<string[]>(
      record?.recipient_guest_ids || [],
    ),
    [busy, setBusy] = useState(false);
  const people = (app.data?.guests || []).filter((g) =>
    app.data?.invitations.some(
      (i) => i.id === g.invitation_id && i.active && !i.archived_at,
    ),
  );
  const recipients = effectiveRecipients(people, target, family, selected),
    error =
      recipientError(target, recipients.length) ||
      scheduledContentError(title, body, channels);
  return (
    <AdminModal
      title={record ? "Editar notificação" : "Nova notificação"}
      premium
      dismissible={!busy}
      onClose={onClose}
    >
      <Field
        label="Título"
        maxLength={160}
        value={title}
        onChangeText={setTitle}
      />
      <Field
        label="Mensagem"
        multiline
        maxLength={3800}
        value={body}
        onChangeText={setBody}
      />
      <ScheduleDateFields
        date={date}
        time={time}
        setDate={setDate}
        setTime={setTime}
      />
      <Choice
        value={target}
        onChange={(v) => {
          setTarget(v);
          setFamily("");
          setSelected([]);
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
              .map((i) => ({ value: i.id, label: i.name })),
          ]}
        />
      ) : null}
      {target === "GUEST"
        ? people.map((g) => (
            <Toggle
              key={g.id}
              label={g.name}
              value={selected.includes(g.id)}
              onChange={(v) =>
                setSelected((ids) =>
                  v ? [...ids, g.id] : ids.filter((id) => id !== g.id),
                )
              }
            />
          ))
        : null}
      <ChannelChoices value={channels} onChange={setChannels} />
      <Toggle label="Notificação ativa" value={active} onChange={setActive} />
      <Text style={styles.small}>
        {error || `${recipients.length} destinatários`}
      </Text>
      <Text style={styles.small}>
        A entrega respeita os consentimentos vigentes e a configuração de cada
        canal. O agendamento é processado no servidor, sem depender desta tela
        aberta.
      </Text>
      <Button
        title={busy ? "Salvando…" : "Salvar agendamento"}
        disabled={
          busy ||
          !!error ||
          !title.trim() ||
          !body.trim() ||
          !channels.length ||
          !date ||
          !time
        }
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await feedback.run(async () => {
              await app.admin("NOTIFICATION_SAVE", {
                id: request,
                version: record?.version,
                title: title.trim(),
                body: body.trim(),
                scheduled_at: scheduledInstant(date, time),
                recipient_guest_ids: recipients,
                channels,
                active,
                audience:
                  target === "ALL"
                    ? "GENERAL"
                    : target === "FAMILY"
                      ? "FAMILY"
                      : "INDIVIDUAL",
                invitation_id: target === "FAMILY" ? family : null,
              });
              onClose();
              return "Notificação agendada.";
            });
          } finally {
            setBusy(false);
          }
        }}
      />
      {feedback.node}
    </AdminModal>
  );
}
export function ScheduledNotifications() {
  const app = useApp(),
    [open, setOpen] = useState(false),
    [record, setRecord] = useState<NotificationSchedule | null>(null),
    [cancel, setCancel] = useState<NotificationSchedule | null>(null),
    [details, setDetails] = useState<NotificationSchedule | null>(null);
  const enabled = !!app.data?.capabilities?.notification_schedules;
  if (!enabled && !Array.isArray(app.data?.notification_schedules))
    return (
      <Text style={styles.notice}>
        Novos agendamentos estarão disponíveis após a implantação segura da
        extensão de notificações. Os lembretes atuais continuam funcionando.
      </Text>
    );
  return (
    <>
      {!enabled ? (
        <Text style={styles.notice}>
          O agendamento aguarda a ativação do worker para este evento. O
          histórico e o cancelamento permanecem disponíveis.
        </Text>
      ) : null}
      <Button
        disabled={!enabled}
        title="Nova notificação"
        onPress={() => {
          setRecord(null);
          setOpen(true);
        }}
      />
      {(app.data?.notification_schedules || []).map((s) => (
        <Card key={s.id}>
          <Text style={styles.heading}>{s.title}</Text>
          <Text style={styles.text}>{s.body}</Text>
          <Text style={styles.small}>
            {new Date(s.scheduled_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            · Horário de Brasília
          </Text>
          <Text style={styles.badge}>
            {scheduleState(s, app.data?.notification_jobs || [])}
          </Text>
          <Text style={styles.small}>
            {s.recipient_guest_ids.length} destinatários ·{" "}
            {s.channels.join(" · ")}
          </Text>
          <Button
            secondary
            title="Ver detalhes"
            onPress={() => setDetails(s)}
          />
          {s.status === "scheduled" ? (
            <>
              <Button
                secondary
                disabled={!enabled}
                title="Editar notificação"
                onPress={() => {
                  setRecord(s);
                  setOpen(true);
                }}
              />
              <Button
                secondary
                title="Cancelar notificação"
                onPress={() => setCancel(s)}
              />
            </>
          ) : null}
          {s.status === "dispatched" &&
          (app.data?.notification_jobs || [])
            .filter((j) => j.message_id === s.id)
            .every(
              (j) =>
                !j.delivery_started_at &&
                !["sent", "uncertain"].includes(j.status),
            ) ? (
            <Button
              secondary
              title="Cancelar notificação"
              onPress={() => setCancel(s)}
            />
          ) : null}
        </Card>
      ))}
      {details ? (
        <AdminModal
          title="Detalhes da notificação"
          premium
          onClose={() => setDetails(null)}
        >
          <Text style={styles.heading}>{details.title}</Text>
          <Text style={styles.text}>{details.body}</Text>
          <Text style={styles.small}>
            {new Date(details.scheduled_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            · Horário de Brasília
          </Text>
          <Text style={styles.badge}>
            {scheduleState(details, app.data?.notification_jobs || [])}
          </Text>
          <Text style={styles.small}>
            {details.recipient_guest_ids
              .map(
                (id) =>
                  app.data?.guests.find((g) => g.id === id)?.name ||
                  "Destinatário indisponível",
              )
              .join(", ")}
          </Text>
          {(app.data?.notification_jobs || [])
            .filter((j) => j.message_id === details.id)
            .map((j) => (
              <Text
                key={j.id}
                style={
                  j.status === "failed" || j.status === "uncertain"
                    ? styles.error
                    : styles.small
                }
              >
                {j.channel} · {j.status} · {j.attempts} tentativa(s)
                {j.last_error ? ` · ${j.last_error}` : ""}
              </Text>
            ))}
          <Button
            secondary
            title="Fechar detalhes"
            onPress={() => setDetails(null)}
          />
        </AdminModal>
      ) : null}
      {open ? <Editor record={record} onClose={() => setOpen(false)} /> : null}
      {cancel ? (
        <ConfirmModal
          title="Cancelar notificação?"
          premium
          text="A notificação ainda não enviada será cancelada. Entregas já realizadas não são desfeitas."
          confirmLabel="Cancelar agendamento"
          onCancel={() => setCancel(null)}
          onConfirm={async () => {
            await app.admin("NOTIFICATION_CANCEL", {
              id: cancel.id,
              version: cancel.version,
            });
            setCancel(null);
          }}
        />
      ) : null}
    </>
  );
}
