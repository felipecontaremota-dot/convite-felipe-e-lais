import { useState } from "react";
import { Text, View } from "react-native";
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
import { AppError } from "../../lib/errors";
import { useApp } from "../../lib/AppProvider";
import { id } from "../../repositories/demo";
import { dispatchMessage } from "../../repositories/api";
import type {
  NotificationPublication,
  Channel,
  NotificationSchedule,
} from "../../types/domain";
import { ChannelChoices } from "./ChannelChoices";
import { ScheduleDateFields } from "./ScheduleDateFields";
import {
  scheduledInstant,
  scheduleFields,
  scheduledContentError,
} from "./scheduling";
import { messageDate, scheduleState } from "../messages/conversations";
import { IconButton } from "../../components/adminUi";
import { usePublicationPages } from "./usePublicationPages";
import { publicationCaption } from "./publication";
export function GeneralNotifications() {
  const app = useApp(),
    feedback = useFeedback();
  const [deleting, setDeleting] = useState<NotificationPublication | null>(
    null,
  );
  const [editor, setEditor] = useState<
      NotificationSchedule | null | undefined
    >(),
    [cancel, setCancel] = useState<NotificationSchedule | null>(null);
  const pages = usePublicationPages(
    app.data?.notification_publications || [],
    app.data?.notification_feed_revision,
  );
  const publications = pages.items;
  return (
    <>
      <Text style={styles.small}>
        Destinatários: todos os convidados elegíveis. Todo envio fica em Recados
        com carinho, mesmo quando apenas Push ou E-mail for selecionado.
      </Text>
      <Button title="Nova notificação" onPress={() => setEditor(null)} />
      {!app.data?.capabilities?.notification_schedules ? (
        <Text style={styles.notice}>
          Envio imediato disponível. O agendamento aguarda ativação segura do
          worker para este evento.
        </Text>
      ) : null}
      {app.data?.notification_config &&
      (!app.data.notification_config.email_enabled ||
        !app.data.notification_config.push_enabled) ? (
        <Text style={styles.small}>
          Canais externos ainda não ativados serão registrados como não
          enviados. A publicação no convite permanece disponível.
        </Text>
      ) : null}
      <Text style={styles.heading}>Agendamentos</Text>
      {(app.data?.notification_schedules || []).map((s) => (
        <Card key={s.id}>
          <Text style={styles.heading}>{s.title}</Text>
          <Text style={styles.text}>{s.body}</Text>
          <Text style={styles.small}>
            {messageDate(s.scheduled_at)} · Horário de Brasília
          </Text>
          <Text style={styles.badge}>
            {s.status === "dispatched"
              ? "Publicada"
              : scheduleState(s, app.data?.notification_jobs || [])}
          </Text>
          <Text style={styles.small}>
            {s.channels.join(" · ")} · Todos os convidados elegíveis
          </Text>
          {s.status === "scheduled" ? (
            <>
              <Button
                secondary
                title="Editar notificação"
                disabled={
                  !app.data?.capabilities?.notification_schedules ||
                  s.audience !== "GENERAL"
                }
                onPress={() => setEditor(s)}
              />
              <Button
                secondary
                title="Cancelar notificação"
                onPress={() => setCancel(s)}
              />
            </>
          ) : null}
        </Card>
      ))}
      <Text style={styles.heading}>Publicações recentes</Text>
      {publications.map((p) => (
        <Card key={p.id}>
          <Text style={styles.heading}>{p.title}</Text>
          <Text style={styles.small}>
            {publicationCaption(p.published_at)} ·{" "}
            {p.origin === "AUTOMATIC" ? "Automática" : "Manual"} ·{" "}
            {p.deleted_at ? "Excluída" : "Publicada"}
          </Text>
          {p.deleted_at ? (
            <Text style={styles.small}>
              Excluída em {messageDate(p.deleted_at).replace(", ", " às ")}
            </Text>
          ) : null}
          <Text style={styles.text}>{p.content}</Text>
          {app.data?.role === "ADMIN" &&
          app.data.capabilities?.notification_deletion &&
          !p.deleted_at ? (
            <View style={styles.row}>
              <IconButton
                icon="delete"
                label={`Excluir notificação: ${p.title}`}
                onPress={() => setDeleting(p)}
              />
            </View>
          ) : null}
          <Text style={styles.small}>
            {p.recipient_count ?? "—"} destinatários ·{" "}
            {p.channels?.join(" · ") || "Canais históricos"}
          </Text>
          {(app.data?.notification_jobs || [])
            .filter((j) => j.message_id === p.id)
            .reduce<
              {
                channel: string;
                total: number;
                sent: number;
                failed: number;
                skipped: number;
                attempts: number;
              }[]
            >((rows, j) => {
              let r = rows.find((r) => r.channel === j.channel);
              if (!r) {
                r = {
                  channel: j.channel,
                  total: 0,
                  sent: 0,
                  failed: 0,
                  skipped: 0,
                  attempts: 0,
                };
                rows.push(r);
              }
              r.total++;
              r.attempts += j.attempts;
              if (j.status === "sent") r.sent++;
              if (["failed", "uncertain"].includes(j.status)) r.failed++;
              if (j.status === "skipped") r.skipped++;
              return rows;
            }, [])
            .map((r) => (
              <Text key={r.channel} style={styles.small}>
                {r.channel}: {r.total} destinatários · {r.sent} aceito(s) pelo
                provedor · {r.failed} falha(s)/incerto(s) · {r.skipped}{" "}
                ignorado(s) · {r.attempts} tentativa(s)
              </Text>
            ))}
        </Card>
      ))}
      {pages.canLoadMore ? (
        <Button
          secondary
          title="Carregar publicações anteriores"
          onPress={() =>
            feedback.run(async () => {
              await pages.loadMore();
              return "";
            })
          }
        />
      ) : null}
      {editor !== undefined ? (
        <NotificationEditor
          record={editor}
          onClose={() => setEditor(undefined)}
        />
      ) : null}
      {cancel ? (
        <ConfirmModal
          title="Cancelar notificação?"
          text="A publicação ainda não executada será cancelada. O histórico será preservado."
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
      {deleting ? (
        <ConfirmModal
          premium
          title="Excluir notificação?"
          text="Esta notificação será removida de 'Recados com carinho' para todos os convidados e não poderá ser restaurada por esta tela. Deseja continuar?"
          confirmLabel="Excluir notificação"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await app.admin("NOTIFICATION_DELETE", { id: deleting.id });
            setDeleting(null);
          }}
        />
      ) : null}
      {feedback.node}
    </>
  );
}
function NotificationEditor({
  record,
  onClose,
}: {
  record: NotificationSchedule | null;
  onClose: () => void;
}) {
  const app = useApp();
  const [request] = useState(() => record?.id || id()),
    [title, setTitle] = useState(record?.title || ""),
    [body, setBody] = useState(record?.body || ""),
    [mode, setMode] = useState(record ? "schedule" : "now"),
    [date, setDate] = useState(scheduleFields(record?.scheduled_at).date),
    [time, setTime] = useState(scheduleFields(record?.scheduled_at).time),
    [channels, setChannels] = useState<Channel[]>(
      record?.channels.filter((c) => c !== "WHATSAPP") || ["IN_APP"],
    ),
    [active, setActive] = useState(record?.active ?? true),
    [review, setReview] = useState(false),
    [reviewInstant, setReviewInstant] = useState(""),
    [busy, setBusy] = useState(false),
    [dateError, setDateError] = useState("");
  const count = (app.data?.guests || []).filter((g) =>
    app.data?.invitations.some(
      (i) => i.id === g.invitation_id && i.active && !i.archived_at,
    ),
  ).length;
  const error = scheduledContentError(title, body, channels);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await (async () => {
        const payload = {
          id: request,
          version: record?.version,
          title: title.trim(),
          body: body.trim(),
          channels,
          audience: "GENERAL",
          active,
          ...(mode === "schedule"
            ? {
                scheduled_at: (() => {
                  try {
                    return scheduledInstant(date, time);
                  } catch {
                    throw new AppError("Escolha uma data futura.");
                  }
                })(),
              }
            : {}),
        };
        await app.admin(
          mode === "now" ? "NOTIFICATION_PUBLISH" : "NOTIFICATION_SAVE",
          payload,
        );
        if (mode === "now" && !app.isDemo) {
          const external = channels.filter((c) => c !== "IN_APP");
          if (external.length) await dispatchMessage(external, request);
          onClose();
          return "Notificação publicada. Consulte os resultados dos canais externos no histórico.";
        }
        onClose();
        return mode === "now"
          ? "Notificação publicada."
          : "Notificação agendada.";
      })();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminModal
      premium
      title={record ? "Editar notificação" : "Nova notificação"}
      dismissible={!busy}
      onClose={onClose}
    >
      <Field
        label="Título"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <Field
        label="Mensagem"
        value={body}
        onChangeText={setBody}
        maxLength={3800}
        multiline
      />
      {!record ? (
        <Choice
          value={mode}
          onChange={setMode}
          options={[
            { value: "now", label: "Enviar agora" },
            { value: "schedule", label: "Agendar envio" },
          ]}
        />
      ) : null}
      {mode === "schedule" ? (
        <ScheduleDateFields
          date={date}
          time={time}
          setDate={setDate}
          setTime={setTime}
        />
      ) : null}
      <ChannelChoices value={channels} onChange={setChannels} />
      {record ? (
        <Toggle label="Notificação ativa" value={active} onChange={setActive} />
      ) : null}
      <Text style={styles.small}>
        Destinatários: todos os convidados elegíveis. Estimativa atual: {count}{" "}
        pessoa(s).
      </Text>
      <Text style={styles.small}>
        Todo envio fica registrado em Recados com carinho. Canais externos
        respeitam consentimentos e disponibilidade. O horário agendado é uma
        previsão de processamento; entregas podem sofrer atrasos.
      </Text>
      {error || dateError ? (
        <Text style={styles.error}>{error || dateError}</Text>
      ) : null}
      <Button
        title="Revisar notificação"
        disabled={
          busy ||
          !title.trim() ||
          !body.trim() ||
          !channels.length ||
          !!error ||
          !count ||
          (mode === "schedule" &&
            !app.data?.capabilities?.notification_schedules)
        }
        onPress={() => {
          try {
            setReviewInstant(
              mode === "schedule" ? scheduledInstant(date, time) : "",
            );
            setDateError("");
            setReview(true);
          } catch (e) {
            setDateError((e as Error).message);
          }
        }}
      />
      {review ? (
        <ConfirmModal
          premium
          title="Confirmar notificação"
          destructive={false}
          text={`${title}\n\n${body}\n\nCanais: ${channels.join(" · ")}\nDestinatários: todos os convidados elegíveis (${count} estimados)\n${mode === "now" ? "Enviar agora" : messageDate(reviewInstant) + " · Horário de Brasília"}`}
          confirmLabel={
            mode === "now" ? "Publicar e enviar" : "Salvar agendamento"
          }
          onCancel={() => setReview(false)}
          onConfirm={save}
        />
      ) : null}
    </AdminModal>
  );
}
