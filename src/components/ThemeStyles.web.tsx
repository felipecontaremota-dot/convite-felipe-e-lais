import { theme } from "../theme/tokens";
export function ThemeStyles() {
  const c = theme.colors;
  return (
    <style>{`
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
