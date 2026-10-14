import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
let now = Date.now();
const listeners = new Set<() => void>();
let cleanup: (() => void) | null = null;
const update = () => {
  now = Date.now();
  listeners.forEach((fn) => fn());
};
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    now = Date.now();
    const timer = setInterval(update, 1000);
    const native = AppState.addEventListener("change", (s) => {
      if (s === "active") update();
    });
    const visible = () => {
      if (!document.hidden) update();
    };
    if (Platform.OS === "web") {
      document.addEventListener("visibilitychange", visible);
      window.addEventListener("focus", update);
    }
    cleanup = () => {
      clearInterval(timer);
      native.remove();
      if (Platform.OS === "web") {
        document.removeEventListener("visibilitychange", visible);
        window.removeEventListener("focus", update);
      }
    };
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      cleanup?.();
      cleanup = null;
    }
  };
}
const snapshot = () => now;
export function useCountdownClock() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
