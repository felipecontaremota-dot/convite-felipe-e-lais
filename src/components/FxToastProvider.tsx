import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { TransientToast } from "./TransientToast";
export type ToastPhase = "entering" | "visible" | "leaving";
const Context = createContext<{
  notify: (message: string) => void;
  reducedMotion: boolean;
} | null>(null);
export function FxToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    phase: ToastPhase;
    id: number;
  } | null>(null);
  const [reducedMotion, setReduced] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  const sequence = useRef(0);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => {
    alive.current = true;
    if (Platform.OS === "web") {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReduced(media.matches);
      media.addEventListener("change", update);
      return () => {
        alive.current = false;
        clear();
        media.removeEventListener("change", update);
      };
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive.current) setReduced(v);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      alive.current = false;
      clear();
      subscription.remove();
    };
  }, [clear]);
  const notify = useCallback(
    (message: string) => {
      clear();
      const duration = reducedMotion ? 0 : 200;
      const id = ++sequence.current;
      setToast({ id, message, phase: duration ? "entering" : "visible" });
      if (duration)
        timers.current.push(
          setTimeout(
            () => setToast({ id, message, phase: "visible" }),
            duration,
          ),
        );
      timers.current.push(
        setTimeout(
          () => setToast({ id, message, phase: "leaving" }),
          duration + 1000,
        ),
      );
      timers.current.push(
        setTimeout(() => setToast(null), duration + 1000 + duration),
      );
    },
    [clear, reducedMotion],
  );
  const value = useMemo(
    () => ({ notify, reducedMotion }),
    [notify, reducedMotion],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {toast ? (
        <TransientToast
          key={toast.id}
          {...toast}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </Context.Provider>
  );
}
export function useFxToast() {
  const value = useContext(Context);
  if (!value) throw new Error("FxToastProvider ausente");
  return value;
}
