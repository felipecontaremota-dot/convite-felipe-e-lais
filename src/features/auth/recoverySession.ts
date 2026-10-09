import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/errors";
export type RecoveryInput =
  | { kind: "implicit"; access_token: string; refresh_token: string }
  | { kind: "token_hash"; token_hash: string }
  | { kind: "existing" }
  | { kind: "invalid" };
export function parseRecovery(search: string, hash: string): RecoveryInput {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  if (
    [fragment, query].some((params) =>
      ["error", "error_code", "error_description"].some((key) =>
        params.has(key),
      ),
    )
  )
    return { kind: "invalid" };
  if (
    fragment.has("access_token") ||
    fragment.has("refresh_token") ||
    fragment.has("type")
  ) {
    const access_token = fragment.get("access_token"),
      refresh_token = fragment.get("refresh_token");
    if (
      fragment.get("type") !== "recovery" ||
      !access_token ||
      !refresh_token ||
      access_token.length > 16384 ||
      refresh_token.length > 4096
    )
      return { kind: "invalid" };
    return { kind: "implicit", access_token, refresh_token };
  }
  if (query.has("token_hash") || query.has("type")) {
    const token = query.get("token_hash");
    return query.get("type") === "recovery" &&
      token &&
      /^[A-Za-z0-9_-]{20,512}$/.test(token)
      ? { kind: "token_hash", token_hash: token }
      : { kind: "invalid" };
  }
  return { kind: "existing" };
}
// Temporary in-memory handoff: never persist or log URL credentials ourselves.
let capturedRecovery: RecoveryInput | undefined;
export function captureRecoveryUrl(
  location: { pathname: string; search: string; hash: string },
  clear: () => void,
) {
  if (
    /\/recuperar-senha\/?$/.test(location.pathname) &&
    (location.search || location.hash)
  ) {
    capturedRecovery = parseRecovery(location.search, location.hash);
    clear(); // Remove credentials before Router initialization or any network request.
  }
}
export function takeRecoveryUrl() {
  const input = capturedRecovery;
  capturedRecovery = undefined;
  return input;
}
export async function establishRecovery(
  client: Pick<SupabaseClient, "auth">,
  input: RecoveryInput,
) {
  if (input.kind === "invalid")
    throw new AppError("Link de recuperação inválido ou expirado.");
  const result =
    input.kind === "implicit"
      ? await client.auth.setSession({
          access_token: input.access_token,
          refresh_token: input.refresh_token,
        })
      : input.kind === "token_hash"
        ? await client.auth.verifyOtp({
            token_hash: input.token_hash,
            type: "recovery",
          })
        : await client.auth.getSession();
  if (result.error || !result.data.session)
    throw new AppError("Link de recuperação inválido ou expirado.");
}
