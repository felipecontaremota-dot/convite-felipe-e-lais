import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { theme } from "../theme/tokens";
import type { ProposalSlots } from "./HomeProposalVideo";

const url =
  "https://nwgyxmwaqckpghznbfzm.supabase.co/storage/v1/object/public/convites-assets/pedido-casamento-web.mp4";
const sessionKey = "wedding:proposal-intro:v1";
let seenInMemory = false;
function wasSeen() {
  try {
    return seenInMemory || sessionStorage.getItem(sessionKey) === "seen";
  } catch {
    return seenInMemory;
  }
}
function markSeen() {
  seenInMemory = true;
  try {
    sessionStorage.setItem(sessionKey, "seen");
  } catch {
    /* Storage is optional. */
  }
}

export function HomeProposalVideo({
  active,
  manual = false,
  origin = "content",
  children,
}: {
  active: boolean;
  manual?: boolean;
  origin?: "content" | "header";
  children: (slots: ProposalSlots) => ReactNode;
}) {
  const [phase, setPhase] = useState<"waiting" | "open" | "closing" | "closed">(
    "waiting",
  );
  const [muted, setMuted] = useState(true);
  const [requested, setRequested] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const replay = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const recordOrigin = useCallback(() => {
    if (origin !== "header") return;
    const button = header.current?.getBoundingClientRect();
    const space = player.current
      ?.closest(".proposal-space")
      ?.getBoundingClientRect();
    if (button && space)
      setAnchor({
        x: Math.max(
          0,
          Math.min(space.width, button.left + button.width / 2 - space.left),
        ),
        y: button.top + button.height / 2 - space.top,
      });
  }, [origin]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generation = useRef(0);
  const restoreFocus = useRef(false);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const close = useCallback(() => {
    generation.current++;
    clearTimers();
    recordOrigin();
    player.current?.pause();
    restoreFocus.current = !!player.current?.parentElement?.contains(
      document.activeElement,
    );
    setPhase("closing");
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 850;
    timers.current.push(
      setTimeout(() => {
        setPhase("closed");
        setRequested(false);
      }, duration),
    );
  }, [clearTimers, recordOrigin]);
  const open = useCallback(() => {
    clearTimers();
    recordOrigin();
    if (!manual) markSeen(); // An attempted presentation counts even if autoplay/network fails.
    setMuted(true);
    setRequested(true);
    setPhase("open");
  }, [clearTimers, manual, recordOrigin]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const video = player.current;
    if (active && !manual) {
      const seen = wasSeen();
      timers.current.push(
        setTimeout(() => {
          setPhase(seen ? "closed" : "waiting");
          setRequested(false);
        }, 0),
      );
      if (!seen) timers.current.push(setTimeout(open, 1000));
    } else {
      timers.current.push(
        setTimeout(() => {
          setPhase("closed");
          setRequested(false);
        }, 0),
      );
    }
    return () => {
      invalidate();
      clearTimers();
      video?.pause();
      if (origin === "header" && video) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [active, manual, clearTimers, open, invalidate, origin]);
  useEffect(() => {
    if (phase === "closed" && restoreFocus.current) {
      restoreFocus.current = false;
      (origin === "header" ? header.current : replay.current)?.focus();
    }
    if (phase !== "open" || !active) return;
    const video = player.current;
    if (!video) return;
    const attempt = ++generation.current;
    video.defaultMuted = true;
    video.muted = true;
    video.currentTime = 0; // Only on a new presentation/replay; never on sound toggle.
    const watchdog = setTimeout(() => {
      if (generation.current === attempt && video.readyState < 2) close();
    }, 12000);
    void video.play().catch(() => {
      if (generation.current === attempt) close();
    });
    return () => clearTimeout(watchdog);
  }, [phase, active, close, origin]);
  const control = active ? (
    <button
      ref={replay}
      type="button"
      className="proposal-replay"
      title={manual ? "Assistir ao nosso vídeo" : "Rever nosso vídeo"}
      aria-label={manual ? "Assistir ao nosso vídeo" : "Rever nosso vídeo"}
      onClick={open}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="4" width="18" height="16" rx="4" />
        <path d="m10 8 6 4-6 4Z" />
      </svg>
    </button>
  ) : null;
  const titleAccessory = phase === "closed" || manual ? control : null;
  const headerAccessory = manual ? (
    control
  ) : active ? (
    <button
      ref={header}
      type="button"
      className="proposal-replay"
      title="Assistir ao nosso vídeo"
      aria-label="Assistir ao nosso vídeo"
      onClick={open}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <rect x="3" y="4" width="18" height="16" rx="4" />
        <path d="m10 8 6 4-6 4Z" />
      </svg>
    </button>
  ) : null;
  const video = active ? (
    <>
      <style>{`
      .proposal-space { display: grid; grid-template-rows: 0fr; margin-bottom: -20px;
        transition: grid-template-rows 850ms cubic-bezier(.22,.8,.2,1), margin-bottom 850ms cubic-bezier(.22,.8,.2,1); }
      .proposal-space[data-origin="header"] .proposal-stage { transform-origin:var(--proposal-origin-x) var(--proposal-origin-y); transform:translateY(-8px) scale(.08); opacity:0;
        transition:transform 850ms cubic-bezier(.22,.8,.2,1),opacity 850ms cubic-bezier(.22,.8,.2,1); }
      .proposal-space[data-origin="header"][data-open="true"] .proposal-stage {transform:translateY(0) scale(1);opacity:1;}
      .proposal-space[data-open="true"] { grid-template-rows: 1fr; margin-bottom: 0; }
      .proposal-clip { min-height: 0; overflow: hidden; border-radius: 18px; }
      .proposal-stage { position: relative; aspect-ratio: 16 / 9; background: ${theme.colors.ink}; }
      .proposal-stage video { display: block; width: 100%; height: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
      .proposal-controls { position: absolute; right: max(10px, env(safe-area-inset-right, 0px));
        bottom: max(10px, env(safe-area-inset-bottom, 0px)); left: max(10px, env(safe-area-inset-left, 0px));
        display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .proposal-controls button { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        min-height: 44px; box-sizing: border-box; padding: 8px 14px; border: 1px solid ${theme.colors.card}26;
        border-radius: 999px; background: ${theme.colors.ink}D9; color: ${theme.colors.card};
        box-shadow: 0 4px 12px ${theme.colors.shadow}26, inset 0 1px 0 ${theme.colors.card}0D;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: ${theme.typography.caption}px; font-weight: 600; line-height: 1.2; cursor: pointer;
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        transition: background-color 200ms ease, transform 200ms ease, box-shadow 200ms ease; }
      .proposal-controls .proposal-close { width: 44px; height: 44px; flex: 0 0 44px; padding: 0; }
      .proposal-controls svg { flex-shrink: 0; pointer-events: none; }
      @media (hover: hover) {
        .proposal-controls button:hover { background: color-mix(in srgb, ${theme.colors.ink}D9 82%, ${theme.colors.primary}D9 18%);
          transform: translateY(-1px); box-shadow: 0 5px 14px ${theme.colors.shadow}33, inset 0 1px 0 ${theme.colors.card}0D; }
        .proposal-controls .proposal-close:hover { transform: scale(1.03); }
      }
      .proposal-controls button:active, .proposal-controls .proposal-close:active { transform: scale(.97); }
      .proposal-controls button:focus-visible { outline: 2px solid ${theme.colors.card}; outline-offset: 2px;
        box-shadow: 0 0 0 5px ${theme.colors.ink}E6; }
      .proposal-replay { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
        width: 44px; height: 44px; padding: 0; margin: -10px 0 -10px 6px; border: 0;
        border-radius: 10px; background: transparent; color: ${theme.colors.secondary}; cursor: pointer; }
      .proposal-replay:hover { background: ${theme.colors.wash}; }
      .proposal-replay:focus-visible { outline: 3px solid ${theme.colors.secondary}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { .proposal-space, .proposal-space[data-origin="header"] .proposal-stage { transition: none; }
        .proposal-controls button { transition: none; }
        .proposal-controls button:hover, .proposal-controls .proposal-close:hover, .proposal-controls button:active, .proposal-controls .proposal-close:active { transform: none; } }
    `}</style>
      <div
        className="proposal-space"
        data-origin={origin}
        style={
          origin === "header"
            ? ({
                "--proposal-origin-x": `${anchor.x}px`,
                "--proposal-origin-y": `${anchor.y}px`,
              } as React.CSSProperties)
            : undefined
        }
        data-open={phase === "open"}
        data-phase={phase}
      >
        <div
          className="proposal-clip"
          inert={phase !== "open"}
          aria-hidden={phase !== "open"}
        >
          <div className="proposal-stage">
            <video
              ref={player}
              src={requested ? url : undefined}
              autoPlay={requested}
              muted={muted}
              playsInline
              preload="none"
              aria-label="Vídeo do pedido de casamento de Felipe e Laís"
              onError={() => {
                if (phase === "open") close();
              }}
              onEnded={() => {
                clearTimers();
                timers.current.push(setTimeout(close, 500));
              }}
            />
            <div className="proposal-controls">
              <button
                type="button"
                aria-label={muted ? "Ativar som" : "Silenciar"}
                onClick={() => {
                  const video = player.current;
                  if (!video) return;
                  video.muted = !video.muted;
                  setMuted(video.muted);
                }}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 5 6 9H3v6h3l5 4Z" />
                  {muted ? (
                    <path d="m16 9 5 6m0-6-5 6" />
                  ) : (
                    <>
                      <path d="M15 8a6 6 0 0 1 0 8" />
                      <path d="M18 5a10 10 0 0 1 0 14" />
                    </>
                  )}
                </svg>
                <span>{muted ? "Ativar som" : "Silenciar"}</span>
              </button>
              <button
                type="button"
                className="proposal-close"
                aria-label="Fechar vídeo"
                onClick={close}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  ) : null;
  return children({ titleAccessory, video, headerAccessory });
}
