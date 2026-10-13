import { useRef, useState } from "react";
import { router } from "expo-router";
import { useApp } from "../../lib/AppProvider";
import { AppError, friendlyError } from "../../lib/errors";
export function useInvitationEntry() {
  const app = useApp();
  const guard = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canResume, setCanResume] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      setCanResume(false);
      router.replace("/inicio");
    } catch (e) {
      setError(friendlyError(e));
      setCanResume(e instanceof AppError && e.code === "ENTRY_LOAD");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  return { busy, error, canResume, run, resume: () => run(app.resumeEntry) };
}
