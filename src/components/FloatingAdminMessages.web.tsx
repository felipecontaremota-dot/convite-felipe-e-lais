import { usePathname } from "expo-router";
import { useApp } from "../lib/AppProvider";
import { theme } from "../theme/tokens";
import { AdminMessageCenter } from "../features/messages/AdminMessageCenter";
import { useMessageCenter } from "../features/messages/MessageCenterContext";
import { unreadMessages } from "../features/messages/conversations";
const paths = new Set([
  "/painel",
  "/familias",
  "/convidados",
  "/gestao-presentes",
  "/gestao-mensagens",
  "/notificacoes",
  "/dia-do-evento",
  "/configuracao",
  "/conta",
]);
export function FloatingAdminMessages() {
  const app = useApp(),
    path = usePathname(),
    center = useMessageCenter();
  if (app.data?.role !== "ADMIN" || !paths.has(path)) return null;
  const count = unreadMessages(app.data);
  return (
    <>
      <style>{`.wedding-admin-messages{position:fixed;z-index:20;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));width:56px;height:56px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:${theme.colors.primary};color:${theme.colors.card};box-shadow:0 4px 16px ${theme.colors.shadow}26;cursor:pointer;transition:transform 180ms ease,background-color 180ms ease}.wedding-admin-messages:hover{background:${theme.colors.primaryHover};transform:translateY(-2px)}.wedding-admin-messages:active{transform:scale(.96)}.wedding-admin-messages:focus-visible{outline:3px solid ${theme.colors.focus};outline-offset:4px}@media(prefers-reduced-motion:reduce){.wedding-admin-messages{transition:none}}`}</style>
      <button
        className="wedding-admin-messages"
        type="button"
        aria-label={`Mensagens dos convidados${count ? `, ${count} não lidas` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={center.open}
        onClick={() => center.show()}
      >
        <svg
          aria-hidden="true"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" />
          <path d="M7 8h10M7 12h7" />
        </svg>
        {count > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -3,
              top: -3,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              boxSizing: "border-box",
              padding: "0 3px",
              background: theme.colors.error,
              color: theme.colors.card,
              fontSize: 11,
              lineHeight: "20px",
              fontWeight: 700,
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {center.open ? <AdminMessageCenter /> : null}
    </>
  );
}
