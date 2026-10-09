import { codeFromLink } from "./security";
export function safeSystemPath(path: string): string {
  if (path.length > 1024) return "/";
  const plain = path.split(/[?#]/)[0] || "/";
  const code = codeFromLink(plain);
  if (code) return `/c/${code}`;
  // Incoming native paths never pass arbitrary queries/malformed escapes to the Router parser.
  const routes = new Set([
    "/",
    "/login",
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
