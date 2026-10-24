import { createPortal } from "react-dom";
import { useLetterReading, PARAGRAPH_REVEAL_MS } from "./useLetterReading";
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
  const { reducedMotion } = useFxToast();
  const root = useLetterReading(reducedMotion);
  const fontBase = (process.env.EXPO_PUBLIC_WEB_BASE_PATH || "").replace(
    /\/$/,
    "",
  );
  return (
    <>
      <style>{`
 @font-face{font-family:PartyHand;src:url("${fontBase}/fonts/DancingScript.ttf") format("truetype");font-weight:400 700;font-display:swap;}
 [data-paper-wrap]{width:100%;max-width:740px;filter:drop-shadow(0 16px 22px #0000001c);}
 [data-paper-wrap]:has(:focus-visible){outline:3px solid #D6BC78;outline-offset:5px;}
 [data-party-paper]{position:relative;isolation:isolate;box-sizing:border-box;width:100%;max-width:740px;padding:clamp(28px,6vw,70px);border:1px solid #d7d8d2;border-radius:2px 5px 3px 6px;background:#fcfcfa url("${fontBase}/textures/letter-paper.svg") center/100% 100%;color:#18324F;clip-path:polygon(.1% .08%,18% 0,39% .05%,62% 0,81% .06%,99.9% .01%,100% 14%,99.8% 32%,100% 51%,99.8% 74%,100% 89%,99.9% 99.95%,77% 100%,55% 99.94%,31% 100%,.1% 99.95%,0 82%,.2% 63%,0 43%,.2% 22%);scroll-margin-top:24px;}
 [data-party-paper]::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:3px;box-shadow:inset 2px 0 5px #787b7012,inset -2px 0 4px #787b7010;clip-path:polygon(0 .2%,25% 0,50% .15%,75% 0,100% .2%,99.8% 25%,100% 50%,99.7% 75%,100% 99.8%,75% 100%,50% 99.9%,25% 100%,0 99.8%,.2% 75%,0 50%,.25% 25%);}
 [data-party-paper]:focus{outline:none;}[data-party-paper]:focus-visible{outline:3px solid #D6BC78;outline-offset:5px;}
 [data-party-paper] h2{font:600 clamp(36px,5vw,48px)/1.35 PartyHand,"Segoe Script",cursive;text-align:center;margin:0 0 38px;}
 [data-letter-paragraph]{font:400 clamp(25px,3vw,30px)/1.65 PartyHand,"Segoe Script",cursive;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;hyphens:auto;-webkit-hyphens:auto;text-align:justify;text-align-last:start;margin:0 0 30px;opacity:1;transform:none;}
 [data-reading-ready] [data-letter-paragraph]{transition:opacity ${PARAGRAPH_REVEAL_MS}ms ease,transform ${PARAGRAPH_REVEAL_MS}ms ease;}
 [data-reading-ready] [data-read-state="hidden"]{opacity:0;transform:translateY(12px);}
 [data-letter-paragraph] strong{font-weight:700;}
 [data-letter-actions]{display:flex;flex-direction:column;gap:18px;margin-top:38px;}
 [data-paper-handoff]{position:fixed;inset:0;z-index:10001;background:#fff;pointer-events:none;opacity:0;animation:paper-unveil 640ms ease-out both;}
 @keyframes paper-unveil{0%,18.75%{opacity:1}100%{opacity:0}}
 @media(prefers-reduced-motion:reduce){[data-paper-handoff]{animation:none;}[data-reading-ready] [data-letter-paragraph]{opacity:1;transform:none;transition:none;}}
 @media(max-width:430px){[data-letter-paragraph]{text-align:left;}}
 @media print{[data-reading-ready] [data-letter-paragraph]{opacity:1;transform:none;}}
 `}</style>
      {arriving &&
        createPortal(
          <div data-paper-handoff aria-hidden="true" />,
          document.body,
        )}
      <div data-paper-wrap>
        <article
          ref={root}
          tabIndex={-1}
          data-party-paper
          lang="pt-BR"
          aria-label="Carta especial de Felipe e Laís"
        >
          <h2>Um pedido de coração</h2>
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
      </div>
    </>
  );
}
