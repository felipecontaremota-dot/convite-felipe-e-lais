// Only the recovery route accepts bounded, allowlisted one-time token parameters.
// No implicit access_token/refresh_token or arbitrary Router search state is accepted.
if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  window.location.search
) {
  const query = new URLSearchParams(window.location.search);
  const token = query.get("token_hash");
  const recovery =
    /\/recuperar-senha$/.test(window.location.pathname) &&
    query.get("type") === "recovery" &&
    token &&
    /^[A-Za-z0-9_-]{20,512}$/.test(token);
  window.history.replaceState(
    null,
    "",
    window.location.pathname +
      (recovery
        ? `?token_hash=${encodeURIComponent(token)}&type=recovery`
        : "") +
      window.location.hash,
  );
}
export {};
