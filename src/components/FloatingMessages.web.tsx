import { useEffect, useState } from "react";
import { router, usePathname } from "expo-router";
import { useApp } from "../lib/AppProvider";
import { theme } from "../theme/tokens";

const visitKey = "wedding:messages-presentation:v1";
let fallbackStarted: number | null = null;
const guestPaths = new Set([
  "/inicio",
  "/presenca",
  "/ingressos",
  "/presentes",
  "/como-chegar",
  "/mensagens",
  "/informacoes",
  "/perfil",
]);

// Mounted above the route stack: route changes do not reset the presentation.
export function FloatingMessages() {
  const app = useApp();
  const pathname = usePathname();
  const eligible = app.data?.role === "GUEST" && guestPaths.has(pathname);
  const [phase, setPhase] = useState("idle");
  useEffect(() => {
    if (!eligible) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let started = fallbackStarted;
    try {
      const saved = Number(sessionStorage.getItem(visitKey));
      if (saved > 0 && saved <= Date.now()) started = saved;
    } catch {
      /* Private browsers may disable storage; retain the in-memory visit. */
    }
    started ??= Date.now();
    fallbackStarted = started;
    try {
      sessionStorage.setItem(visitKey, String(started));
    } catch {
      /* Optional persistence. */
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const update = () => {
      timers.splice(0).forEach(clearTimeout);
      if (motion.matches) {
        setPhase("done");
        return;
      }
      const elapsed = Date.now() - started;
      const stages = [
        [0, "idle"],
        [5000, "opening"],
        [6050, "reading"],
        [11050, "closing"],
        [12400, "done"],
      ] as const;
      setPhase(
        [...stages].reverse().find(([time]) => elapsed >= time)?.[1] || "idle",
      );
      stages
        .filter(([time]) => time > elapsed)
        .forEach(([time, value]) => {
          timers.push(setTimeout(() => setPhase(value), time - elapsed));
        });
    };
    update();
    motion.addEventListener("change", update);
    return () => {
      timers.forEach(clearTimeout);
      motion.removeEventListener("change", update);
    };
  }, [eligible]);
  if (!eligible) return null;
  return (
    <>
      <style>{`
      .wedding-messages {
        position: fixed; right: calc(22px + env(safe-area-inset-right, 0px));
        bottom: calc(28px + env(safe-area-inset-bottom, 0px)); z-index: 20;
        width: 56px; height: 56px; padding: 0; overflow: hidden; cursor: pointer;
        border: 1px solid ${theme.colors.secondary}; border-radius: 999px; color: ${theme.colors.line};
        background: linear-gradient(115deg, ${theme.colors.ink}, ${theme.colors.primaryActive});
        box-shadow: 0 8px 26px ${theme.colors.shadow}30, inset 0 0 8px ${theme.colors.line}16;
        transition: width 1050ms cubic-bezier(.22,1,.36,1), transform 650ms ease, box-shadow 650ms ease;
        font-family: inherit;
      }
      .wedding-messages[data-phase="opening"], .wedding-messages[data-phase="reading"] {
        width: min(336px, calc(100vw - 44px - env(safe-area-inset-right, 0px) - env(safe-area-inset-left, 0px)));
      }
      .wedding-messages[data-phase="opening"] { box-shadow: 0 8px 30px ${theme.colors.shadow}40, 0 0 18px ${theme.colors.line}24, inset 0 0 8px ${theme.colors.line}20; }
      .wedding-messages[data-phase="closing"] { transition-delay: 300ms, 0ms, 0ms; }
      .wedding-messages-label {
        position: absolute; right: 65px; top: 0; height: 54px; display: flex; align-items: center;
        white-space: nowrap; font-size: 14px; color: ${theme.colors.card}; opacity: 0; transform: translateX(9px);
        transition: opacity 240ms ease, transform 240ms ease; pointer-events: none;
      }
      .wedding-messages[data-phase="opening"] .wedding-messages-label,
      .wedding-messages[data-phase="reading"] .wedding-messages-label {
        opacity: 1; transform: translateX(0); transition-duration: 750ms; transition-delay: 320ms;
      }
      .wedding-messages-icon { position: absolute; right: 15px; top: 15px; width: 24px; height: 24px; }
      .wedding-messages-shimmer { position: absolute; inset: 0; pointer-events: none; opacity: 0;
        background: linear-gradient(110deg, transparent 25%, ${theme.colors.line}24 50%, transparent 75%); }
      .wedding-messages[data-phase="opening"] .wedding-messages-shimmer, .wedding-messages[data-phase="reading"] .wedding-messages-shimmer { animation: wedding-shimmer 1450ms ease-out both; }
      @keyframes wedding-shimmer { 0% { transform: translateX(-100%); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateX(100%); opacity: 0; } }
      @media (hover: hover) { .wedding-messages:hover { transform: translateY(-2px); box-shadow: 0 10px 30px ${theme.colors.shadow}40, inset 0 0 8px ${theme.colors.line}20; } }
      .wedding-messages:focus-visible { outline: 3px solid ${theme.colors.focus}; outline-offset: 4px; }
      @media (max-width: 359px) { .wedding-messages-label { font-size: 12px; right: 60px; } }
      @media (prefers-reduced-motion: reduce) { .wedding-messages, .wedding-messages-label { transition: none !important; } .wedding-messages-shimmer { animation: none !important; } }
    `}</style>
      <button
        type="button"
        className="wedding-messages"
        data-phase={phase}
        aria-label="Deixe uma mensagem para o casal"
        onClick={() => router.push("/mensagens")}
      >
        <span aria-hidden="true" className="wedding-messages-shimmer" />
        <span aria-hidden="true" className="wedding-messages-label">
          Deixe uma mensagem para o casal
        </span>
        <svg
          className="wedding-messages-icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 11.5a9 9 0 0 1-9 9 9.3 9.3 0 0 1-4-.9L3 21l1.4-5a9 9 0 1 1 16.6-4.5Z" />
          <path d="M12 15.5 8.7 12.4a2.2 2.2 0 0 1 3.3-2.9 2.2 2.2 0 0 1 3.3 2.9Z" />
        </svg>
      </button>
    </>
  );
}
