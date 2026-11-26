import { useState } from "react";
import { Text } from "react-native";
import { randomUUID } from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminModal } from "../../components/AdminModal";
import {
  Button,
  Card,
  Field,
  Toggle,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { supabase, eventId } from "../../lib/supabase";
import {
  reminderBody,
  reminderSubject,
  reminderContentError,
  reminderImage,
  reminderTemplate,
  reminderDue,
} from "../../../supabase/functions/_shared/ten-day-content";
import { ReminderPreview } from "./ReminderPreview";
interface Campaign {
  id: string;
  version: number;
  enabled: boolean;
  subject: string;
  body: string;
  state: string;
  reason: string | null;
  started_at: string | null;
  scheduled_at: string;
  image_available: boolean | null;
  estimated: number;
  counts: Record<string, number>;
  results: {
    id: string;
    name: string | null;
    status: string;
    attempts: number;
    last_error: string | null;
    provider_id: string | null;
  }[];
}
async function configuration(
  action = "READ",
  payload: Record<string, unknown> = {},
) {
  if (!supabase) throw Error("Configuração indisponível.");
  const r = await supabase.rpc("ten_day_email_admin", {
    p_event: eventId,
    p_action: action,
    p_payload: payload,
  });
  if (r.error)
    throw Error(
      r.error.message.includes("unauthorized")
        ? "Acesso não autorizado."
        : r.error.message.includes("changed")
          ? "A configuração mudou. Atualize antes de salvar."
          : r.error.message.includes("late activation")
            ? "Horário ultrapassado. Verifique a imagem e use a retomada explícita."
            : "Não foi possível atualizar o lembrete. Confira os dados e tente novamente.",
    );
  if (
    !r.data ||
    !Number.isInteger(r.data.version) ||
    typeof r.data.subject !== "string" ||
    typeof r.data.body !== "string" ||
    !Array.isArray(r.data.results) ||
    !r.data.counts
  )
    throw Error("Configuração do lembrete indisponível.");
  return r.data as Campaign;
}
async function operation(action: string, extra: Record<string, unknown> = {}) {
  if (!supabase) throw Error("Configuração indisponível.");
  const r = await supabase.functions.invoke("dispatch-notifications", {
    body: { event_id: eventId, ten_day: action, ...extra },
  });
  if (r.error)
    throw Error(
      "Não foi possível concluir. Verifique a imagem e a configuração do e-mail.",
    );
  return r.data;
}
export function TenDayReminder() {
  const app = useApp();
  const query = useQuery({
    queryKey: ["ten-day-reminder", app.scope],
    queryFn: () => configuration(),
    enabled: app.data?.role === "ADMIN" && !app.isDemo,
    refetchInterval: 30000,
    retry: 1,
  });
  if (app.data?.role !== "ADMIN") return null;
  return (
    <ReminderEditor
      key={query.data?.version || "loading"}
      c={query.data}
      isError={query.isError}
      retry={() => void query.refetch()}
    />
  );
}
function ReminderEditor({
  c,
  isError,
  retry,
}: {
  c: Campaign | undefined;
  isError: boolean;
  retry: () => void;
}) {
  const app = useApp(),
    feedback = useFeedback(),
    client = useQueryClient();
  const [subject, setSubject] = useState(c?.subject || reminderSubject),
    [body, setBody] = useState(c?.body || reminderBody),
    [enabled, setEnabled] = useState(c?.enabled || false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [email, setEmail] = useState(""),
    [details, setDetails] = useState(false);
  const error = reminderContentError(subject, body);
  const image = reminderImage(
    process.env.EXPO_PUBLIC_SUPABASE_URL?.startsWith("https://")
      ? process.env.EXPO_PUBLIC_SUPABASE_URL
      : "https://example.test",
  );
  const mail = error
    ? null
    : reminderTemplate(subject, body, {
        name: "Convidado de teste (fictício)",
        url: "https://felipeelais2026.com.br/c/PREVIA-FICTICIA-SEM-ACESSO",
        pin: "0000",
        image,
      });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["ten-day-reminder", app.scope] });
  const run = async (work: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    try {
      await feedback.run(work);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const scheduled = c?.scheduled_at || reminderDue(app.data!.event.starts_at);
  return (
    <Card>
      <Text style={styles.heading}>Lembrete — Faltam 10 dias</Text>
      <Text style={styles.small}>
        E-mail · convidados confirmados · Horário de Brasília
      </Text>
      <Text style={styles.text}>
        {new Date(scheduled).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })}
      </Text>
      <Text style={styles.small}>
        Estimativa dinâmica: {c?.estimated ?? "—"} destinatários. A seleção
        definitiva ocorre no disparo, com nova validação antes de cada envio.
      </Text>
      <Text style={styles.small}>
        Situação:{" "}
        {c?.state === "blocked"
          ? "Bloqueado"
          : c?.started_at
            ? "Processamento iniciado"
            : c?.enabled
              ? "Aguardando horário programado"
              : "Desativado"}
        {c?.reason ? ` · ${c.reason}` : ""}
      </Text>
      <Text style={styles.small}>
        Arte:{" "}
        {c?.image_available === true
          ? "disponível na última verificação"
          : c?.image_available === false
            ? "upload pendente ou imagem indisponível"
            : "ainda não verificada"}
      </Text>
      {isError ? (
        <>
          <Text style={styles.error}>
            Configuração do lembrete indisponível.
          </Text>
          <Button
            secondary
            title="Carregar lembrete novamente"
            onPress={retry}
          />
        </>
      ) : null}
      <Field
        label="Assunto do e-mail de 10 dias"
        value={subject}
        onChangeText={setSubject}
        maxLength={200}
        editable={!c?.started_at}
      />
      <Field
        label="Mensagem do e-mail de 10 dias"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={8000}
        editable={!c?.started_at}
      />
      <Text style={styles.small}>
        Preserve {"{{nome}}, {{link}} e {{senha}}"}. Use **texto** para negrito.
        Após o início, a versão enviada é preservada.
      </Text>
      <Toggle
        label="Ativar envio automático do lembrete de 10 dias"
        value={enabled}
        onChange={setEnabled}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Salvar lembrete de 10 dias"
        disabled={busy || !c || !!error}
        onPress={() =>
          void run(async () => {
            await configuration("SAVE", {
              version: c!.version,
              subject,
              body,
              enabled,
            });
            return "Lembrete atualizado.";
          })
        }
      />
      <Button
        secondary
        title="Verificar imagem do lembrete"
        disabled={busy || !c}
        onPress={() =>
          void run(async () => {
            const result = await operation("IMAGE");
            return result.available
              ? "Imagem disponível."
              : "Upload da arte ainda pendente ou imagem indisponível.";
          })
        }
      />
      <Button
        secondary
        title="Pré-visualizar e-mail de 10 dias"
        disabled={!!error}
        onPress={() => setPreview(true)}
      />
      <Field
        label="Destino do e-mail de teste"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button
        secondary
        title="Enviar e-mail de teste"
        disabled={busy || !c || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
        onPress={() =>
          void run(async () => {
            const result = await operation("TEST", {
              email,
              request_id: randomUUID(),
            });
            return result.status === "accepted"
              ? "Teste aceito pelo provedor. Confira a caixa de entrada; não é confirmação de entrega."
              : result.status === "uncertain"
                ? "Resultado do teste indeterminado. Confira o Resend antes de repetir."
                : "Teste não enviado. Verifique a configuração ou a solicitação anterior.";
          })
        }
      />
      <Text style={styles.small}>
        O teste usa a versão salva e dados fictícios, sem credenciais de
        convidados. A validação definitiva depende do upload e da conferência do
        e-mail recebido.
      </Text>
      {c?.state === "blocked" ? (
        <Button
          secondary
          title="Retomar processamento por uma hora"
          disabled={busy || !c.image_available}
          onPress={() =>
            void run(async () => {
              await configuration("RESUME", { version: c.version });
              return "Retomada autorizada por uma hora.";
            })
          }
        />
      ) : null}
      <Text style={styles.small}>
        Aceitos pelo provedor: {c?.counts.sent || 0} · Falhas:{" "}
        {c?.counts.failed || 0} · Ignorados: {c?.counts.skipped || 0} ·
        Indeterminados: {c?.counts.uncertain || 0}. Entrega na caixa de entrada:
        não comprovada (sem webhook de entrega).
      </Text>
      <Button
        secondary
        title="Ver resultados do lembrete"
        onPress={() => setDetails(true)}
      />
      {(c?.counts.failed || 0) > 0 ? (
        <Button
          secondary
          title="Reprocessar falhas seguras do lembrete"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await configuration("RETRY", { version: c!.version });
              return "Falhas definitivas liberadas; resultados indeterminados não serão reenviados.";
            })
          }
        />
      ) : null}
      {preview && mail ? (
        <AdminModal
          title="Prévia fictícia — Faltam 10 dias"
          onClose={() => setPreview(false)}
          premium
        >
          <Text style={styles.text}>{mail.title}</Text>
          <ReminderPreview html={mail.html} text={mail.text} />
        </AdminModal>
      ) : null}
      {details ? (
        <AdminModal
          title="Resultados — Faltam 10 dias"
          onClose={() => setDetails(false)}
          premium
        >
          {!c?.results.length ? (
            <Text style={styles.small}>
              Nenhum destinatário processado. A estimativa ainda é dinâmica.
            </Text>
          ) : (
            c.results.map((r) => (
              <Text key={r.id} style={styles.small}>
                {r.name || "Convidado indisponível"} · {r.status} · {r.attempts}{" "}
                tentativa(s){r.last_error ? ` · ${r.last_error}` : ""}
                {r.provider_id ? ` · Resend: ${r.provider_id}` : ""}
              </Text>
            ))
          )}
        </AdminModal>
      ) : null}
      {feedback.node}
    </Card>
  );
}
