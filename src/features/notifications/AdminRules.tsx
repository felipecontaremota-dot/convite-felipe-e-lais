import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  Toggle,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import type { Rule } from "../../types/domain";
import { notificationTime } from "../notifications/domain";
import { ChannelChoices } from "./ChannelChoices";
function RuleEditor({ rule: r }: { rule: Rule }) {
  const app = useApp(),
    feedback = useFeedback();
  const [title, setTitle] = useState(r.title),
    [body, setBody] = useState(r.body),
    [active, setActive] = useState(r.active),
    [selected, setSelected] = useState(r.channels);
  return (
    <Card>
      <Text style={styles.heading}>
        {r.days_before === 0
          ? "É hoje"
          : r.days_before === 1
            ? "É amanhã"
            : `${r.days_before} dias antes`}
      </Text>
      <Text style={styles.small}>
        {new Date(
          notificationTime(app.data!.event.starts_at, r.days_before),
        ).toLocaleString("pt-BR", { timeZone: app.data!.event.timezone })}
      </Text>
      <Field label="Título do lembrete" value={title} onChangeText={setTitle} />
      <Field
        label="Texto do lembrete"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <Toggle label="Regra ativa" value={active} onChange={setActive} />
      <ChannelChoices value={selected} onChange={setSelected} />
      <Button
        title="Salvar lembrete"
        disabled={!title.trim() || !body.trim() || !selected.length}
        onPress={() =>
          feedback.run(() =>
            app.admin("RULE_SAVE", {
              id: r.id,
              version: r.version,
              title,
              body,
              active,
              channels: selected,
            }),
          )
        }
      />
      {feedback.node}
    </Card>
  );
}

export function RulesScreen() {
  const app = useApp();
  return (
    <Screen section="admin" title="Lembretes do nosso dia">
      {app.data?.rules.map((r) => (
        <RuleEditor key={r.id} rule={r} />
      ))}
      {!app.data?.rules.length ? (
        <Empty text="Aplique o seed do evento para criar as regras iniciais." />
      ) : null}
      <Text style={styles.heading}>Histórico de entregas</Text>
      {app.data?.notification_jobs.map((job) => (
        <Card key={job.id}>
          <Text style={styles.text}>
            {job.channel} · {job.status} · {job.attempts} tentativa(s)
          </Text>
          {job.last_error ? (
            <Text style={styles.error}>{job.last_error}</Text>
          ) : null}
        </Card>
      ))}
      {!app.data?.notification_jobs.length ? (
        <Empty text="Nenhuma entrega agendada ou enviada ainda." />
      ) : null}
      <Text style={styles.heading}>Sincronização com a planilha</Text>
      {app.data?.sheet_jobs.map((job) => (
        <Card key={job.id}>
          <Text style={styles.text}>
            {job.status} · versão {job.version} · {job.attempts} tentativa(s)
          </Text>
          {job.last_error ? (
            <Text style={styles.error}>{job.last_error}</Text>
          ) : null}
        </Card>
      ))}
      {!app.data?.sheet_jobs.length ? (
        <Empty text="Nenhum job de planilha nesta base." />
      ) : null}
    </Screen>
  );
}
