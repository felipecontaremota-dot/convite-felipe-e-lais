import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useFxToast } from "../../components/FxToastProvider";
import {
  envelopeSequence,
  envelopeTiming,
  playEnvelopeAnimation,
  type EnvelopePhase,
} from "./envelopeTimeline";
export function Envelope({ onReveal }: { onReveal: () => void }) {
  const { reducedMotion } = useFxToast();
  const [phase, setPhase] = useState<EnvelopePhase>("closed");
  const lock = useRef(false),
    scene = useRef<HTMLButtonElement>(null),
    light = useRef<HTMLDivElement>(null),
    controller = useRef<AbortController | null>(null),
    callback = useRef(onReveal);
  useEffect(() => {
    callback.current = onReveal;
  });
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (reducedMotion && lock.current) {
      controller.current?.abort();
      callback.current();
    }
  }, [reducedMotion]);
  const open = async () => {
    if (lock.current) return;
    lock.current = true;
    if (reducedMotion) {
      callback.current();
      return;
    }
    const control = new AbortController();
    controller.current = control;
    const host = scene.current!;
    const get = (selector: string) =>
      host.querySelector<HTMLElement>(selector)!;
    const play = async (
      step: "seal" | "flap" | "settle" | "letter" | "light",
    ) => {
      if (control.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      if (step === "seal")
        await playEnvelopeAnimation(
          get("[data-envelope-seal]"),
          [
            { opacity: 1, transform: "translate(-50%,-50%)" },
            { opacity: 0, transform: "translate(-50%,-35%) rotate(-10deg)" },
          ],
          envelopeTiming.seal,
          control.signal,
        );
      if (step === "flap") {
        await playEnvelopeAnimation(
          get("[data-party-flap]"),
          [{ transform: "rotateX(0deg)" }, { transform: "rotateX(178deg)" }],
          envelopeTiming.flap,
          control.signal,
        );
        get("[data-party-flap]").style.zIndex = "0";
        host.dataset.openedAt = String(performance.now());
      }
      if (step === "settle") {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }
      if (step === "letter") {
        if (control.signal.aborted)
          throw new DOMException("Aborted", "AbortError");
        get("[data-envelope-letter-window]").style.clipPath =
          "inset(-160% 0 0 0)";
        const paper = get("[data-envelope-letter]");
        paper.style.visibility = "visible";
        host.dataset.extractedAt = String(performance.now());
        await playEnvelopeAnimation(
          paper,
          [{ transform: "translateY(0)" }, { transform: "translateY(-88%)" }],
          envelopeTiming.extract,
          control.signal,
        );
      }
      if (step === "light")
        await playEnvelopeAnimation(
          light.current!,
          [{ opacity: 0 }, { opacity: 1 }],
          envelopeTiming.lightIn,
          control.signal,
        );
    };
    try {
      await envelopeSequence(play, setPhase);
      if (!control.signal.aborted) callback.current();
    } catch {
      if (!control.signal.aborted) callback.current();
    }
  };
  const opening = phase !== "closed";
  const fontBase = (process.env.EXPO_PUBLIC_WEB_BASE_PATH || "").replace(
    /\/$/,
    "",
  );
  return (
    <>
      <link
        rel="preload"
        as="font"
        type="font/ttf"
        crossOrigin="anonymous"
        href={`${fontBase}/fonts/DancingScript.ttf`}
      />
      <style>{`
 @font-face{font-family:PartyHand;src:url("${fontBase}/fonts/DancingScript.ttf") format("truetype");font-weight:400 700;font-display:swap;}
 [data-party-stage="envelope"] > :not([data-envelope-scene]){transition:opacity 500ms ease;}
 [data-party-stage="envelope"]:has([data-opening="true"]) > :not([data-envelope-scene]){opacity:.14;}
 [data-envelope-scene]{width:100%;max-width:340px;aspect-ratio:1.53;position:relative;perspective:1100px;margin:36px auto 24px;isolation:isolate;}
 [data-party-envelope]{display:block;position:relative;width:100%;height:100%;padding:0;border:0;border-radius:9px;background:transparent;cursor:pointer;perspective:1100px;animation:party-float 4.8s ease-in-out infinite;color:#18324F;}
 [data-party-envelope]:focus-visible{outline:3px solid #F4E6BD;outline-offset:9px;}
 [data-envelope-shell]{position:absolute;inset:0;border-radius:9px;background:linear-gradient(140deg,#EADBB9,#CEB379);box-shadow:0 18px 35px #00000030,inset 0 0 0 1px #FFF5DA88;transition:transform 500ms ease;}
 [data-envelope-shell]::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' opacity='.09' filter='url(%23p)' d='M0 0h160v160H0z'/%3E%3C/svg%3E");border-radius:9px;z-index:7;}
 [data-envelope-pocket]{position:absolute;inset:0;border-radius:9px;overflow:hidden;z-index:1;box-shadow:inset 0 14px 25px #6F522F35;background:linear-gradient(180deg,#BFA473,#E1C994);}
 [data-envelope-letter-window]{position:absolute;inset:0;z-index:2;clip-path:inset(0);pointer-events:none;}
 [data-envelope-letter]{visibility:hidden;transform:none;position:absolute;left:11%;top:8%;width:78%;height:115%;background:#FCFCFA;border:1px solid #E0D5BB;box-shadow:0 2px 12px #00000025;z-index:2;display:grid;place-content:start center;padding-top:15%;box-sizing:border-box;font:400 25px PartyHand,"Segoe Script",cursive;color:#18324F;}
 [data-envelope-fold]{position:absolute;inset:0;z-index:3;pointer-events:none;}
 [data-envelope-fold="left"]{background:linear-gradient(35deg,#D2B980,#EAD9B3);clip-path:polygon(0 0,57% 55%,0 100%);}
 [data-envelope-fold="right"]{background:linear-gradient(-35deg,#C7AD74,#E7D4AC);clip-path:polygon(100% 0,43% 55%,100% 100%);}
 [data-envelope-fold="bottom"]{background:linear-gradient(170deg,#F0DFBB,#D3B980);clip-path:polygon(0 100%,0 96%,50% 44%,100% 96%,100% 100%);filter:drop-shadow(0 -1px 1px #75562835);z-index:4;}
 [data-party-flap]{position:absolute;inset:0 0 44%;z-index:5;transform-origin:50% 0;transform-style:preserve-3d;filter:drop-shadow(0 3px 2px #74532B30);}
 [data-party-flap]::before{content:"";position:absolute;inset:0;clip-path:polygon(0 0,100% 0,50% 100%);background:linear-gradient(150deg,#FFF2D4,#E3C997);backface-visibility:visible;}
 [data-envelope-seal]{position:absolute;z-index:6;left:50%;top:49%;width:68px;height:68px;display:grid;place-content:center;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #D6BC78;box-shadow:0 4px 7px #00000038,inset 0 0 0 3px #18324F,inset 0 0 0 4px #D6BC7860;background:radial-gradient(circle at 30% 25%,#254D6A,#142D46 75%);color:#F4E6BD;font:25px Georgia,serif;}
 @media(hover:hover){[data-party-envelope]:not(:disabled):hover [data-envelope-shell]{transform:rotateX(5deg) rotateY(-4deg) translateY(-3px);}}

 [data-party-envelope][data-opening="true"]{animation-play-state:paused;cursor:default;}
 [data-party-envelope][data-opening="true"] [data-envelope-shell]{transform:none;}
 [data-envelope-flash]{position:fixed;inset:0;z-index:10000;background:#fff;opacity:0;pointer-events:none;}
 @media(prefers-reduced-motion:reduce){[data-party-envelope]{animation:none!important;}[data-envelope-shell]{transition:none!important;}}
`}</style>
      <div data-envelope-scene>
        <button
          ref={scene}
          type="button"
          data-party-envelope
          data-phase={phase}
          data-opening={String(opening)}
          aria-label="Abrir convite especial"
          aria-busy={opening}
          disabled={opening}
          onClick={open}
        >
          <span data-envelope-shell>
            <span data-envelope-pocket />
            <span data-envelope-letter-window aria-hidden="true">
              <span data-envelope-letter>
                Um pedido
                <br />
                de coração
              </span>
            </span>
            <span data-envelope-fold="left" />
            <span data-envelope-fold="right" />
            <span data-envelope-fold="bottom" />
            <span data-party-flap />
            <span data-envelope-seal aria-hidden="true">
              F&amp;L
            </span>
          </span>
        </button>
      </div>
      {createPortal(
        <div ref={light} data-envelope-flash aria-hidden="true" />,
        document.body,
      )}
    </>
  );
}
