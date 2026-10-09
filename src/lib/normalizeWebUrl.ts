import { captureRecoveryUrl } from "../features/auth/recoverySession";
// Recovery credentials are handed off in memory and removed before Router initializes.
// Router must never restore credential query parameters from its navigation state.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  captureRecoveryUrl(window.location, () =>
    window.history.replaceState(null, "", window.location.pathname),
  );
  if (window.location.search)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );
}
export {};
