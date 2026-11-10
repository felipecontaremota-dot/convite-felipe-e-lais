import { guestNoteStyle } from "./guestNoteStyle";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { theme } from "../../theme/tokens";
import type { Guest } from "../../types/domain";
export function GuestNoteIndicator({ guest }: { guest: Guest }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 280 });
  const root = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    pinned = useRef(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && document.activeElement !== root.current)
        setOpen(false);
    }, 160);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const note = guest.admin_notes;
  useLayoutEffect(() => {
    if (!open || !note?.trim()) return;
    const place = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, innerWidth - 24),
        height = popup.current?.offsetHeight || 120;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
        top:
          rect.bottom + height + 8 <= innerHeight - 12
            ? rect.bottom + 8
            : Math.max(12, rect.top - height - 8),
      });
    };
    place();
    const frame = requestAnimationFrame(place);
    const outside = (e: PointerEvent) => {
      if (
        !root.current?.contains(e.target as Node) &&
        !popup.current?.contains(e.target as Node)
      ) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinned.current = false;
        setOpen(false);
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, note]);
  if (!note?.trim()) return null;
  return (
    <>
      <button
        ref={root}
        type="button"
        aria-label={`Observação de ${guest.name}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(e) => {
          if (!popup.current?.contains(e.relatedTarget as Node)) {
            pinned.current = false;
            setOpen(false);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          border: 0,
          background: "transparent",
          cursor: "help",
          borderRadius: 14,
          padding: 8,
        }}
      >
        <span style={guestNoteStyle}>!</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={popup}
              id={id}
              role="tooltip"
              onMouseEnter={show}
              onMouseLeave={hide}
              onBlur={(e) => {
                if (!root.current?.contains(e.relatedTarget as Node)) {
                  pinned.current = false;
                  setOpen(false);
                }
              }}
              tabIndex={0}
              style={{
                position: "fixed",
                ...position,
                zIndex: 1100,
                boxSizing: "border-box",
                padding: "12px 16px",
                borderRadius: 12,
                border: `1px solid ${theme.colors.line}`,
                background: theme.colors.card,
                color: theme.colors.ink,
                font: '14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                boxShadow: `0 4px 16px ${theme.colors.shadow}20`,
                maxHeight: "calc(100vh - 24px)",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {note}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
