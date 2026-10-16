import { captureRecoveryUrl } from "../features/auth/recoverySession";
// Recovery credentials are handed off in memory and removed before Router initializes.
// Router must never restore credential query parameters from its navigation state.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  captureRecoveryUrl(window.location, () =>
    window.history.replaceState(null, "", window.location.pathname),
  );
  // Only the new exclusive area's non-sensitive navigation parameters survive.
  // All credential/unknown parameters continue to be removed before Router starts.
  const navigation = partyNavigation(
    window.location.pathname,
    window.location.search,
  );
  if (window.location.search)
    window.history.replaceState(
      null,
      "",
      window.location.pathname +
        (navigation ? `?${navigation}` : "") +
        window.location.hash,
    );
}
export function partyNavigation(pathname: string, search: string): string {
  const navigation = new URLSearchParams();
  if (pathname.endsWith("/padrinhos")) {
    const input = new URLSearchParams(search);
    if (input.get("surpresa") === "1") navigation.set("surpresa", "1");
    const page = input.get("pagina");
    if (page && ["dia", "traje", "cerimonia", "recado"].includes(page))
      navigation.set("pagina", page);
  }
  return navigation.toString();
}
