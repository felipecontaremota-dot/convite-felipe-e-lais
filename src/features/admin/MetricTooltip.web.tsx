import {
  useLayoutEffect,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { theme } from "../../theme/tokens";

// An independent help target never invokes the adjacent card action on touch.
export function MetricTooltip({
  label,
  text,
  children,
}: {
  label: string;
  text: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [shown, setShown] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 280 });
  const root = useRef<HTMLDivElement>(null),
    popup = useRef<HTMLDivElement>(null),
    pinned = useRef(false),
    id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 24);
      const height = popup.current?.offsetHeight || 165;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top:
          rect.bottom + 8 + height <= window.innerHeight - 12
            ? rect.bottom + 8
            : Math.max(12, rect.top - height - 8),
      });
    };
    place();
    const frame = requestAnimationFrame(() => setShown(true));
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinned.current = false;
        setShown(false);
        setOpen(false);
      }
    };
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        pinned.current = false;
        setShown(false);
        setOpen(false);
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const hide = () => {
    if (!pinned.current) {
      setShown(false);
    }
  };
  useEffect(() => {
    if (shown || !open) return;
    const timer = setTimeout(() => setOpen(false), 160);
    return () => clearTimeout(timer);
  }, [shown, open]);
  return (
    <div
      ref={root}
      data-metric={label}
      style={{
        flexGrow: 1,
        alignSelf: "stretch",
        minWidth: 145,
        flexBasis: 145,
        position: "relative",
        display: "flex",
      }}
      onMouseEnter={() => {
        setOpen(true);
        setShown(true);
      }}
      onMouseLeave={hide}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          pinned.current = false;
          hide();
        }
      }}
      onClickCapture={(e) => {
        if (!(e.target as HTMLElement).closest("[data-metric-help]")) {
          pinned.current = false;
          setShown(false);
          setOpen(false);
        }
      }}
    >
      {children}
      <button
        data-metric-help
        type="button"
        aria-label={`Sobre ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          pinned.current = !pinned.current;
          if (pinned.current) setOpen(true);
          setShown(pinned.current);
        }}
        style={{
          position: "absolute",
          right: 2,
          top: 2,
          width: 44,
          height: 44,
          border: 0,
          background: "transparent",
          color: theme.colors.secondary,
          borderRadius: 12,
          cursor: "help",
          fontSize: 17,
        }}
      >
        ⓘ
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            onMouseEnter={() => {
              setOpen(true);
              setShown(true);
            }}
            onMouseLeave={hide}
            role="tooltip"
            data-metric-tooltip
            style={{
              position: "fixed",
              ...position,
              zIndex: 1000,
              boxSizing: "border-box",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1px solid ${theme.colors.line}`,
              background: theme.colors.card,
              color: theme.colors.ink,
              font: '14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
              boxShadow: `0 4px 16px ${theme.colors.shadow}20`,
              opacity: shown ? 1 : 0,
              transition: "opacity 150ms ease-out",
              pointerEvents: "auto",
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
              animation: "metric-tooltip-enter 150ms ease-out",
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </div>
  );
}
