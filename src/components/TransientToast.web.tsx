import { createPortal } from "react-dom";
import { theme } from "../theme/tokens";
import type { ToastPhase } from "./FxToastProvider";
export function TransientToast({
  message,
  phase,
  reducedMotion,
}: {
  message: string;
  phase: ToastPhase;
  reducedMotion: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <style>{`
    .fx-toast {position:fixed;top:calc(18px + env(safe-area-inset-top,0px));right:calc(18px + env(safe-area-inset-right,0px));
      z-index:80;max-width:calc(100vw - 36px);pointer-events:none;display:flex;align-items:center;gap:8px;
      padding:12px 16px;border:1px solid ${theme.colors.line};border-radius:12px;background:${theme.colors.card};
      color:${theme.colors.ink};font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 6px 20px ${theme.colors.shadow}18;}
    .fx-toast[data-phase="entering"] {animation:fx-toast-in 200ms ease-out both;}
    .fx-toast[data-phase="leaving"] {animation:fx-toast-out 200ms ease-out both;}
    @keyframes fx-toast-in {from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fx-toast-out {from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-4px)}}
    @media(prefers-reduced-motion:reduce){.fx-toast{animation:none!important;transform:none!important;}}
  `}</style>
      <div
        role="status"
        aria-live="polite"
        className="fx-toast"
        data-phase={phase}
        data-reduced={reducedMotion}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.colors.secondary}
          strokeWidth="1.8"
        >
          <path d="m5 12 4 4L19 6" />
        </svg>
        {message}
      </div>
    </>,
    document.body,
  );
}
