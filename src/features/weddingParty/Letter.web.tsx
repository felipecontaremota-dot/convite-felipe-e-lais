import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui";
import { useFxToast } from "../../components/FxToastProvider";
import { letterParagraphs } from "./letterContent";
import type { PartyRole } from "./types";
export interface LetterProps {
  name: string;
  arriving?: boolean;
  message?: string | null;
  role: PartyRole;
  busy: boolean;
  onAccept: () => void;
  onThink: () => void;
}
export function Letter({
  name,
  arriving,
  message,
  role,
  busy,
  onAccept,
  onThink,
}: LetterProps) {
  const root = useRef<HTMLElement>(null);
  const { reducedMotion } = useFxToast();
  useEffect(() => {
    const article = root.current;
    if (!article) return;
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: "start", behavior: "instant" });
    if (reducedMotion || !("IntersectionObserver" in window)) return;
    let observer: IntersectionObserver | undefined;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              // Keep text readable even if animation support or observation later fails.
              if (typeof (entry.target as HTMLElement).animate === "function") {
                try {
                  (entry.target as HTMLElement).animate(
                    [
                      { opacity: 0.2, transform: "translateY(14px)" },
                      { opacity: 1, transform: "translateY(0)" },
                    ],
                    { duration: 850, easing: "cubic-bezier(.2,.8,.2,1)" },
                  );
                } catch {
                  /* Visible static text is the fallback. */
                }
              }
              entry.target.setAttribute("data-revealed", "true");
              observer?.unobserve(entry.target);
            }
        },
        { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
      );
      article
        .querySelectorAll("[data-letter-paragraph]")
        .forEach((node) => observer!.observe(node));
    } catch {
      observer?.disconnect();
    }
    return () => observer?.disconnect();
  }, [reducedMotion]);
  const fontBase = (process.env.EXPO_PUBLIC_WEB_BASE_PATH || "").replace(
    /\/$/,
    "",
  );
  return (
    <>
      <style>{`
 @font-face{font-family:PartyCaveat;src:url("${fontBase}/fonts/Caveat.ttf") format("truetype");font-weight:400 700;font-display:swap;}
 [data-party-paper]{box-sizing:border-box;width:100%;max-width:700px;padding:clamp(26px,6vw,66px);border:1px solid #D9CBAA;border-radius:4px;background-color:#FAF5E9;background-image:radial-gradient(#7C66330C .6px,transparent .8px),linear-gradient(115deg,#FFFFFF65,transparent 55%,#D6BC7814);background-size:5px 5px,100% 100%;color:#18324F;box-shadow:0 22px 65px #00000025,0 2px 8px #00000016;scroll-margin-top:24px;animation:party-paper-land 700ms cubic-bezier(.2,.8,.2,1) both;}
 [data-party-paper]:focus{outline:none;} [data-party-paper]:focus-visible{outline:3px solid #D6BC78;outline-offset:5px;}
 [data-party-paper] h2{font:500 clamp(28px,5vw,36px)/1.4 Georgia,serif;text-align:center;margin:0 0 36px;}
 [data-letter-paragraph]{font:400 clamp(25px,3vw,31px)/1.5 PartyCaveat,"Segoe Print",cursive;letter-spacing:.15px;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 28px;}
 [data-letter-paragraph] strong{font-weight:700;}
 [data-letter-actions]{display:flex;flex-direction:column;gap:18px;margin-top:38px;}
 [data-paper-handoff]{position:fixed;inset:0;z-index:10001;background:#FAF5E9;pointer-events:none;opacity:0;animation:paper-unveil 420ms ease-out both;}
 @keyframes paper-unveil{from{opacity:1}to{opacity:0}}
 @keyframes party-paper-land{from{opacity:.65;transform:scale(1.025) translateY(8px)}to{opacity:1;transform:none}}
 @media(prefers-reduced-motion:reduce){[data-party-paper],[data-paper-handoff]{animation:none;}}
 `}</style>
      {arriving &&
        createPortal(
          <div data-paper-handoff aria-hidden="true" />,
          document.body,
        )}
      <article
        ref={root}
        tabIndex={-1}
        data-party-paper
        aria-label="Carta especial de Felipe e Laís"
      >
        <h2>Um pedido do coração</h2>
        {letterParagraphs(name, message, role).map((p, i) => (
          <p key={i} data-letter-paragraph>
            {p.before}
            {p.name && <strong>{p.name}</strong>}
            {p.after}
          </p>
        ))}
        <div data-letter-actions>
          <Button
            title="💙 É claro que aceito!"
            disabled={busy}
            onPress={onAccept}
          />
          <Button
            secondary
            title="Preciso pensar um pouquinho..."
            disabled={busy}
            onPress={onThink}
          />
        </div>
      </article>
    </>
  );
}
