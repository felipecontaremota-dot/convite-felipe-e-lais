import { createPortal } from "react-dom";
import type { RSVP } from "../../types/domain";
import { useFxToast } from "../../components/FxToastProvider";
import { theme } from "../../theme/tokens";
export function RsvpFx({ status }: { status: RSVP; onCancel?: () => void }) {
  const { reducedMotion } = useFxToast();
  if (reducedMotion || typeof document === "undefined") return null;
  const symbols =
    status === "CONFIRMED"
      ? ["🎉", "🎈", "▪", "▪"]
      : status === "DECLINED"
        ? ["💔"]
        : ["🤔"];
  return createPortal(
    <div
      aria-hidden="true"
      data-rsvp-fx={status}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 90,
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes rsvp-rise{0%{opacity:0;transform:translate(0,0) rotate(-8deg) scale(.7)}12%{opacity:1}55%{opacity:1;transform:translate(var(--drift),calc(var(--rise) * -.8)) rotate(9deg) scale(1)}100%{opacity:0;transform:translate(calc(var(--drift)*.7),calc(var(--rise) * -1)) rotate(24deg) scale(.8)}}`}</style>
      {Array.from({ length: status === "CONFIRMED" ? 20 : 12 }, (_, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              bottom: `${6 + (i % 3) * 3}%`,
              left: `${22 + ((i * 17) % 58)}%`,
              fontSize: 20 + (i % 4) * 5,
              color: i % 2 ? theme.colors.secondary : theme.colors.primary,
              animation: `rsvp-rise ${1500 + (i % 4) * 70}ms cubic-bezier(.12,.7,.35,1) ${(i % 7) * 40}ms both`,
              "--rise": `${46 + (i % 5) * 4}vh`,
              "--drift": `${(i % 2 ? 1 : -1) * (25 + (i % 5) * 17)}px`,
            } as React.CSSProperties
          }
        >
          {symbols[i % symbols.length]}
        </span>
      ))}
    </div>,
    document.body,
  );
}
