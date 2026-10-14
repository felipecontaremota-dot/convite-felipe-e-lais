export type InstallStatus =
  | "pending"
  | "unsupported"
  | "ready"
  | "prompting"
  | "accepted"
  | "dismissed"
  | "error"
  | "installed";
export type InstallPrompt = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export type InstallSnapshot = {
  status: InstallStatus;
  installed: boolean;
  busy: boolean;
  promptAvailable: boolean;
  registeredAt: number;
  reactAttachedAt: number | null;
  capturedAt: number | null;
  capturePhase: "early" | "react" | null;
  defaultPrevented: boolean | null;
  eventTrusted: boolean | null;
  lastOutcome: "accepted" | "dismissed" | "error" | null;
  fallbackReason: InstallStatus | null;
  consumed: number;
};
export type InstallStore = {
  getSnapshot: () => InstallSnapshot;
  subscribe: (listener: () => void) => () => void;
  consume: () => InstallPrompt | null;
  complete: (outcome: "accepted" | "dismissed" | "error") => void;
  fallback: () => void;
};
declare global {
  interface Window {
    __weddingPwaInstall?: InstallStore;
  }
}

// Self-contained: Node strips the types before serializing this function into HTML.
// One store and one set of browser listeners per document, independent of React.
export function installBootstrap(target: Window): InstallStore {
  if (target.__weddingPwaInstall) return target.__weddingPwaInstall;
  const display = target.matchMedia("(display-mode: standalone)");
  const nav = target.navigator as Navigator & { standalone?: boolean };
  const unsupported =
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) ||
    !("onbeforeinstallprompt" in target);
  let installed = display.matches || nav.standalone === true;
  let appInstalled = false;
  let busy = false;
  let deferred: InstallPrompt | null = null;
  const seen = new WeakSet<Event>();
  const subscribers = new Set<() => void>();
  let snapshot: InstallSnapshot = {
    status: installed ? "installed" : unsupported ? "unsupported" : "pending",
    installed,
    busy,
    promptAvailable: false,
    registeredAt: target.performance.now(),
    reactAttachedAt: null,
    capturedAt: null,
    capturePhase: null,
    defaultPrevented: null,
    eventTrusted: null,
    lastOutcome: null,
    fallbackReason: null,
    consumed: 0,
  };
  const publish = (patch: Partial<InstallSnapshot>) => {
    snapshot = {
      ...snapshot,
      ...patch,
      installed,
      busy,
      promptAvailable: !!deferred && !installed && !busy,
    };
    subscribers.forEach((listener) => listener());
  };
  const onInstalled = () => {
    appInstalled = installed = true;
    deferred = null;
    publish({ status: "installed" });
  };
  const store: InstallStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      subscribers.add(listener);
      if (snapshot.reactAttachedAt === null)
        publish({ reactAttachedAt: target.performance.now() });
      return () => {
        subscribers.delete(listener);
      };
    },
    consume: () => {
      if (installed || busy || !deferred) return null;
      const prompt = deferred;
      deferred = null;
      busy = true;
      publish({
        status: "prompting",
        consumed: snapshot.consumed + 1,
        fallbackReason: null,
      });
      return prompt;
    },
    complete: (outcome) => {
      busy = false;
      publish({
        status: installed ? "installed" : deferred ? "ready" : outcome,
        lastOutcome: outcome,
      });
    },
    fallback: () => publish({ fallbackReason: snapshot.status }),
  };
  // A non-enumerable capability reference; it is never serialized or persisted.
  Object.defineProperty(target, "__weddingPwaInstall", { value: store });
  target.addEventListener("beforeinstallprompt", (event) => {
    if (installed || seen.has(event)) return;
    const prompt = event as InstallPrompt;
    if (typeof prompt.prompt !== "function" || !prompt.userChoice) return;
    event.preventDefault();
    seen.add(event);
    deferred = prompt;
    publish({
      status: busy ? "prompting" : "ready",
      capturedAt: target.performance.now(),
      capturePhase: snapshot.reactAttachedAt === null ? "early" : "react",
      defaultPrevented: event.defaultPrevented,
      eventTrusted: event.isTrusted,
      fallbackReason: null,
    });
  });
  target.addEventListener("appinstalled", onInstalled);
  display.addEventListener("change", () => {
    installed = appInstalled || display.matches || nav.standalone === true;
    if (installed) deferred = null;
    publish({
      status: installed
        ? "installed"
        : busy
          ? "prompting"
          : deferred
            ? "ready"
            : unsupported
              ? "unsupported"
              : "pending",
    });
  });
  return store;
}

export function installBootstrapScript() {
  return `(${installBootstrap.toString()})(window);`;
}
