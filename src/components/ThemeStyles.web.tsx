import { theme } from "../theme/tokens";
export function ThemeStyles() {
  const c = theme.colors;
  return (
    <style>{`
    [data-guest-row] { transition: background-color 180ms ease-out; }
    [data-guest-row][data-selected="true"], [data-guest-row]:focus-within { background-color: ${c.wash}99; }
    @media(hover:hover) { [data-guest-row]:hover { background-color: ${c.wash}99; } }
    [data-fx-action] { transition: background-color 220ms ease-out, border-color 220ms ease-out; }
    @media(prefers-reduced-motion:reduce) { [data-guest-row], [data-fx-action] { transition:none; } }
    [data-premium-modal="open"] { transform-origin:center; animation:guest-modal-in 780ms cubic-bezier(.2,.8,.25,1) both; }
    [data-premium-modal="open"] > * { animation:guest-content-in 780ms ease-out both; }
    [data-premium-modal="closing"] { animation:guest-modal-out 180ms ease-out both; }
    @keyframes guest-modal-in {0%{opacity:0;transform:scaleX(.2) scaleY(.85)}60%{opacity:1;transform:scaleX(1.025) scaleY(1.015)}80%{transform:scale(.995)}100%{transform:scale(1)}}
    @keyframes guest-content-in {0%,35%{opacity:0}100%{opacity:1}}
    @keyframes guest-modal-out {to{opacity:0;transform:scale(.98)}}
    @media(prefers-reduced-motion:reduce){[data-premium-modal], [data-premium-modal] > * {animation:none!important;}}
    :root { color-scheme: light; background: ${c.paper}; }
    button:focus-visible, [role="button"]:focus-visible, [role="link"]:focus-visible,
    input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 3px solid ${c.focus}; outline-offset: 3px;
    }
    input:focus, textarea:focus, select:focus { border-color: ${c.focus} !important; }
    @media (hover: hover) {
      [data-theme-button="primary"]:not([aria-disabled="true"]):hover { background-color: ${c.primaryHover} !important; }
      [data-theme-button="secondary"]:not([aria-disabled="true"]):hover,
      [data-theme-nav]:hover { background-color: ${c.wash}; border-color: ${c.secondary}; }
    }
    [data-theme-button="primary"]:not([aria-disabled="true"]):active { background-color: ${c.primaryActive} !important; }
    [data-theme-button="secondary"]:not([aria-disabled="true"]):active { background-color: ${c.line} !important; }
  `}</style>
  );
}
