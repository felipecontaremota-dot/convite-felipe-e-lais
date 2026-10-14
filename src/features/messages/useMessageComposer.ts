import { useRef, useState } from "react";
import { useApp } from "../../lib/AppProvider";
import { useFeedback } from "../../components/ui";
import type { MutationType } from "../../types/domain";
export function useMessageComposer() {
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
        const existing = app.pending.find(
          (m) =>
            m.type === type &&
            JSON.stringify(m.payload) === JSON.stringify(payload),
        );
        if (existing) {
          if (!app.online)
            return "Esta mensagem já está pendente neste dispositivo. Será sincronizada ao reconectar.";
          await app.syncNow();
          done();
          return "Mensagem registrada.";
        }
        const result = await app.send(type, payload);
        done();
        return result;
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, send, node: feedback.node };
}
