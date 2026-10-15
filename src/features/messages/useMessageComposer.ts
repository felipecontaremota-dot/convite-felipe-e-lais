import { useRef, useState } from "react";
import { useApp } from "../../lib/AppProvider";
import { useFeedback } from "../../components/ui";
import type { MutationType } from "../../types/domain";
export function useMessageComposer({
  quietSuccess = false,
}: { quietSuccess?: boolean } = {}) {
  const app = useApp(),
    feedback = useFeedback(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const send = async (
    type: MutationType,
    payload: Record<string, unknown>,
    done: () => void,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await feedback.run(async () => {
        const key = (value: Record<string, unknown>) => {
          if (type !== "MESSAGE_SEND" || app.data?.role !== "GUEST")
            return JSON.stringify(value);
          const { sender_guest_id: _sender, ...message } = value;
          return JSON.stringify(message);
        };
        const existing = app.pending.find(
          (m) => m.type === type && key(m.payload) === key(payload),
        );
        if (existing) {
          if (!app.online)
            return "Esta mensagem já está pendente neste dispositivo. Será sincronizada ao reconectar.";
          await app.syncNow(existing.mutationId);
          done();
          return quietSuccess ? "" : "Mensagem registrada.";
        }
        const result = await app.send(type, payload);
        done();
        return quietSuccess && result === "Sincronizado com sucesso."
          ? ""
          : result;
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, send, node: feedback.node };
}
