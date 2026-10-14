import { installBootstrap, type InstallSnapshot } from "./installBootstrap";

const serverSnapshot: InstallSnapshot = {
  status: "pending",
  installed: false,
  busy: false,
  promptAvailable: false,
  registeredAt: 0,
  reactAttachedAt: null,
  capturedAt: null,
  capturePhase: null,
  defaultPrevented: null,
  eventTrusted: null,
  lastOutcome: null,
  fallbackReason: null,
  consumed: 0,
};
// Production has already run the HTML bootstrap. This idempotent fallback also
// supports Expo development without creating a second set of listeners.
const store = () => installBootstrap(window);
export const getInstallSnapshot = () => store().getSnapshot();
export const getServerInstallSnapshot = () => serverSnapshot;
export const subscribeInstall = (listener: () => void) =>
  store().subscribe(listener);
export const consumeInstallPrompt = () => store().consume();
export const completeInstallPrompt = (
  outcome: "accepted" | "dismissed" | "error",
) => store().complete(outcome);
export const recordInstallFallback = () => store().fallback();
