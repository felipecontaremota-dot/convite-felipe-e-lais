import { captureRecoveryUrl } from "../features/auth/recoverySession";
import { codeFromLink } from "./security";
export function safeSystemPath(path: string): string {
  // Recovery is the only native route allowed to hand off URL credentials.
  // Tokens stay in memory; only the clean route reaches Expo Router.
  const recovery = path.match(
    /^(?:felipeelais:\/\/|\/)recuperar-senha(?=[?#]|$)/,
  );
  if (recovery) {
    const suffix = path.slice(recovery[0].length);
    const hashIndex = suffix.indexOf("#");
    const search = hashIndex < 0 ? suffix : suffix.slice(0, hashIndex);
    const hash = hashIndex < 0 ? "" : suffix.slice(hashIndex);
    captureRecoveryUrl(
      {
        pathname: "/recuperar-senha",
        // Bound raw encoded input too, before decoding. Oversized links are invalid.
        search: path.length > 65536 ? "?error=invalid" : search,
        hash: path.length > 65536 ? "" : hash,
      },
      () => {},
    );
    return "/recuperar-senha";
  }
  if (path.length > 1024) return "/";
  const plain = path.split(/[?#]/)[0] || "/";
  const code = codeFromLink(plain);
  if (code) return `/c/${code}`;
  // Incoming native paths never pass arbitrary queries/malformed escapes to the Router parser.
  const routes = new Set([
    "/",
    "/login",
    "/conta",
    "/recuperar-senha",
    "/inicio",
    "/painel",
    "/checkin",
    "/ingressos",
    "/presenca",
    "/presentes",
    "/mensagens",
    "/perfil",
    "/informacoes",
    "/como-chegar",
  ]);
  if (routes.has(plain)) return plain;
  try {
    const url = new URL(plain);
    if (url.protocol === "felipeelais:") {
      const candidate = `/${url.hostname}${url.pathname}`;
      return routes.has(candidate) ? candidate : "/";
    }
  } catch {
    /* Invalid input has a safe destination. */
  }
  return "/";
}
