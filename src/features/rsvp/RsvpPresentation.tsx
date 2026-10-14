import { messageReady } from "../messages/messageDraft";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { GuestModal } from "../../components/GuestModal";
import { Button, Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError, friendlyError } from "../../lib/errors";
import { readCache, storage } from "../../storage/driver";
import { MutationQueue } from "../../storage/queue";
import { useFxToast } from "../../components/FxToastProvider";
import type { RSVP } from "../../types/domain";
import { responseContent } from "./presenceContent";
import { RsvpFx } from "./RsvpFx";
function Compose({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const toast = useFxToast();
  const [queued, setQueued] = useState(false);
  const [content, setContent] = useState("");
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false),
    alive = useRef(true),
    attempted = useRef<{ id: string | null } | null>(null);
  useEffect(() => {
    alive.current = true;
    void readCache<string>(`identity:${app.scope}`).then((v) => {
      if (alive.current) setSender(v || "");
    });
    return () => {
      alive.current = false;
    };
  }, [app.scope]);
  const send = async (close: () => void) => {
    if (lock.current || !messageReady(content)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const text = content.trim();
    const who = app.data?.guests.some((g) => g.id === sender) ? sender : null;
    const queue = new MutationQueue(storage, `queue:${app.scope}`);
    let before: string[] = [];
    const retain = async () => {
      const remaining = await queue.list();
      const added = remaining.filter(
        (m) =>
          !before.includes(m.mutationId) &&
          m.type === "MESSAGE_SEND" &&
          m.payload.content === text &&
          m.payload.sender_guest_id === who,
      );
      if (added.length) {
        attempted.current = {
          id: added.length === 1 ? added[0]!.mutationId : null,
        };
        if (alive.current) setQueued(true);
      }
    };
    try {
      before = (await queue.list()).map((m) => m.mutationId);
      if (attempted.current) {
        const id = attempted.current.id;
        if (!id || !before.includes(id)) {
          if (alive.current)
            setNotice(
              "Esta operação não está mais pendente. Confira o histórico em Mensagens.",
            );
          return;
        }
        const result = await app.sync();
        const remaining = await queue.list();
        if (remaining.some((m) => m.mutationId === id))
          throw new AppError(
            "A mensagem continua pendente. Tente novamente quando houver conexão.",
          );
        if (!result.synced) {
          if (alive.current)
            setNotice(
              "Confira o resultado desta operação no histórico de Mensagens.",
            );
          return;
        }
        if (alive.current) {
          toast.notify("Mensagem enviada aos noivos.");
          close();
        }
      } else {
        const result = await app.send("MESSAGE_SEND", {
          content: text,
          sender_guest_id: who,
        });
        if (!alive.current) return;
        if (result === "Sincronizado com sucesso.") {
          toast.notify("Mensagem enviada aos noivos.");
          close();
        } else {
          await retain();
          if (alive.current) setNotice(result);
        }
      }
    } catch (e) {
      // Match only newly enqueued IDs from this action, never a prior identical text.
      if (!attempted.current) await retain().catch(() => {});
      if (alive.current) setError(friendlyError(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <GuestModal title="Deixe uma mensagem para os noivos 💌" onClose={onClose}>
      {(close) => (
        <>
          <Field
            label="Mensagem aos noivos"
            hideLabel
            placeholder="Deixe uma mensagem para os noivos (opcional)"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={4000}
            editable={!busy && !queued}
          />
          <Button
            title="Enviar"
            disabled={busy || !messageReady(content)}
            onPress={() => send(close)}
          />
          <Button secondary title="Fechar" onPress={close} />
          {busy ? (
            <Text accessibilityLiveRegion="polite" style={styles.small}>
              Enviando…
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </>
      )}
    </GuestModal>
  );
}
export function RsvpPresentation({
  status,
  onDone,
}: {
  status: RSVP;
  onDone: () => void;
}) {
  const { reducedMotion } = useFxToast();
  const [stage, setStage] = useState<"fx" | "response" | "compose">("fx");
  useEffect(() => {
    const t = setTimeout(() => setStage("response"), reducedMotion ? 0 : 2000);
    return () => clearTimeout(t);
  }, [reducedMotion]);
  return (
    <>
      {stage === "fx" ? (
        <RsvpFx status={status} onCancel={onDone} />
      ) : stage === "response" ? (
        <GuestModal
          title={responseContent[status].title}
          onClose={() => setStage("compose")}
        >
          <Text style={[styles.text, { textAlign: "center", lineHeight: 24 }]}>
            {responseContent[status].message}
          </Text>
        </GuestModal>
      ) : (
        <Compose onClose={onDone} />
      )}
    </>
  );
}
