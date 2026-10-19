import { createPortal } from "react-dom";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useFxToast } from "../../components/FxToastProvider";
import { ENVELOPE_DURATION } from "./letterContent";
export function Envelope({ onReveal }: { onReveal: () => void }) {
  const { reducedMotion } = useFxToast();
  const [opening, setOpening] = useState(false);
  const [flight, setFlight] = useState<CSSProperties>();
  const lock = useRef(false),
    done = useRef(false),
    scene = useRef<HTMLButtonElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onReveal);
  useEffect(() => {
    callback.current = onReveal;
  });
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    if (timer.current) clearTimeout(timer.current);
    callback.current();
  }, []);
  useEffect(() => {
    if (reducedMotion && opening) finish();
  }, [reducedMotion, opening, finish]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const open = () => {
    if (lock.current) return;
    lock.current = true;
    if (reducedMotion) {
      finish();
      return;
    }
    const rect = scene.current!.getBoundingClientRect();
    const sheetWidth = rect.width * 0.78,
      sheetHeight = rect.height * 1.15;
    setFlight({
      left: rect.left + rect.width * 0.11,
      top: rect.top + rect.height * 0.08 - sheetHeight * 0.88,
      width: sheetWidth,
      height: sheetHeight,
      "--flight-x": `${innerWidth / 2 - (rect.left + rect.width / 2)}px`,
      "--flight-y": `${innerHeight / 2 - (rect.top + rect.height * 0.08 - sheetHeight * 0.88 + sheetHeight / 2)}px`,
      "--flight-scale":
        Math.max(innerWidth / sheetWidth, innerHeight / sheetHeight) * 1.25,
    } as CSSProperties);
    setOpening(true);
    // Independent of animation events: broken/disabled CSS cannot strand navigation.
    timer.current = setTimeout(finish, ENVELOPE_DURATION + 250);
  };
  return (
    <>
      <style>{`
 [data-party-stage="envelope"] > :not([data-envelope-scene]){transition:opacity 500ms ease;}
 [data-party-stage="envelope"]:has([data-opening="true"]) > :not([data-envelope-scene]){opacity:.14;}
 [data-envelope-scene]{width:100%;max-width:340px;aspect-ratio:1.53;position:relative;perspective:1100px;margin:36px auto 24px;isolation:isolate;}
 [data-party-envelope]{display:block;position:relative;width:100%;height:100%;padding:0;border:0;border-radius:9px;background:transparent;cursor:pointer;perspective:1100px;transform-style:preserve-3d;animation:party-float 4.8s ease-in-out infinite;color:#18324F;}
 [data-party-envelope]:focus-visible{outline:3px solid #F4E6BD;outline-offset:9px;}
 [data-envelope-shell]{position:absolute;inset:0;border-radius:9px;background:linear-gradient(140deg,#EADBB9,#CEB379);box-shadow:0 18px 35px #00000030,inset 0 0 0 1px #FFF5DA88;transition:transform 500ms ease;transform-style:preserve-3d;}
 [data-envelope-shell]::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' opacity='.09' filter='url(%23p)' d='M0 0h160v160H0z'/%3E%3C/svg%3E");border-radius:9px;z-index:7;}
 [data-envelope-pocket]{position:absolute;inset:0;border-radius:9px;overflow:hidden;z-index:1;box-shadow:inset 0 14px 25px #6F522F35;background:linear-gradient(180deg,#BFA473,#E1C994);}
 [data-envelope-letter-window]{position:absolute;inset:0;z-index:2;clip-path:inset(-160% 0 0 0);pointer-events:none;}
 [data-envelope-letter]{position:absolute;left:11%;top:8%;width:78%;height:115%;background:#FAF5E9;border:1px solid #E0D5BB;box-shadow:0 2px 12px #00000025;z-index:2;display:grid;place-content:start center;padding-top:15%;box-sizing:border-box;font:italic 22px Georgia,serif;color:#18324F;}
 [data-envelope-fold]{position:absolute;inset:0;z-index:3;pointer-events:none;}
 [data-envelope-fold="left"]{background:linear-gradient(35deg,#D2B980,#EAD9B3);clip-path:polygon(0 0,57% 55%,0 100%);}
 [data-envelope-fold="right"]{background:linear-gradient(-35deg,#C7AD74,#E7D4AC);clip-path:polygon(100% 0,43% 55%,100% 100%);}
 [data-envelope-fold="bottom"]{background:linear-gradient(170deg,#F0DFBB,#D3B980);clip-path:polygon(0 100%,0 96%,50% 44%,100% 96%,100% 100%);filter:drop-shadow(0 -1px 1px #75562835);z-index:4;}
 [data-party-flap]{position:absolute;inset:0 0 44%;z-index:5;transform-origin:50% 0;transform-style:preserve-3d;filter:drop-shadow(0 3px 2px #74532B30);}
 [data-party-flap]::before{content:"";position:absolute;inset:0;clip-path:polygon(0 0,100% 0,50% 100%);background:linear-gradient(150deg,#FFF2D4,#E3C997);backface-visibility:visible;}
 [data-envelope-seal]{position:absolute;z-index:6;left:50%;top:49%;width:68px;height:68px;display:grid;place-content:center;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #D6BC78;box-shadow:0 4px 7px #00000038,inset 0 0 0 3px #18324F,inset 0 0 0 4px #D6BC7860;background:radial-gradient(circle at 30% 25%,#254D6A,#142D46 75%);color:#F4E6BD;font:25px Georgia,serif;}
 @media(hover:hover){[data-party-envelope]:not(:disabled):hover [data-envelope-shell]{transform:rotateX(5deg) rotateY(-4deg) translateY(-3px);}}
 [data-party-envelope][data-opening="true"]{animation-play-state:paused;cursor:default;}
 [data-opening="true"] [data-envelope-shell]{animation:envelope-response ${ENVELOPE_DURATION}ms both;}
 [data-opening="true"] [data-envelope-seal]{animation:seal-release 650ms ease-in both;}
 [data-opening="true"] [data-party-flap]{animation:flap-open 1150ms 450ms cubic-bezier(.3,.65,.25,1) both;}
 [data-opening="true"] [data-envelope-letter-window]{position:absolute;inset:0;z-index:2;clip-path:inset(-160% 0 0 0);pointer-events:none;}
 [data-envelope-letter]{animation:letter-extract 2250ms 1400ms cubic-bezier(.2,.65,.25,1) both;}
 [data-envelope-flight]{position:fixed;z-index:10000;background:#FAF5E9;border:1px solid #E0D5BB;box-shadow:0 0 40px #00000020;pointer-events:none;display:grid;place-content:center;font:italic 23px Georgia,serif;color:#18324F;opacity:0;animation:letter-flight 1600ms 3600ms cubic-bezier(.55,.05,.7,1) both;transform-origin:center;}
 @keyframes envelope-response{0%{transform:none}7%{transform:scale(.98) rotateX(-3deg)}15%,70%{transform:none;opacity:1}100%{transform:translateY(24px);opacity:.3}}
 @keyframes seal-release{to{transform:translate(-50%,-35%) rotate(-12deg) scale(.94);opacity:0}}
 @keyframes flap-open{0%{transform:rotateX(0);z-index:5}60%{z-index:5}100%{transform:rotateX(178deg);z-index:0}}
 @keyframes letter-extract{0%{transform:translateY(0)}95%{opacity:1}100%{transform:translateY(-88%);opacity:0}}
 @keyframes letter-flight{0%{opacity:0;transform:translate(0,0) scale(1)}2%,45%{opacity:1}100%{opacity:1;transform:translate(var(--flight-x),var(--flight-y)) scale(var(--flight-scale))}}
 @media(prefers-reduced-motion:reduce){[data-party-envelope],[data-envelope-shell],[data-envelope-letter],[data-party-flap],[data-envelope-seal],[data-envelope-flight]{animation:none!important;}[data-envelope-shell]{transition:none!important;}}
 `}</style>
      <div data-envelope-scene>
        <button
          ref={scene}
          type="button"
          data-party-envelope
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
                do coração
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
      {opening &&
        flight &&
        createPortal(
          <div
            data-envelope-flight
            style={flight}
            aria-hidden="true"
            onAnimationEnd={(e) => {
              if (e.animationName === "letter-flight") finish();
            }}
          >
            Um pedido do coração
          </div>,
          document.body,
        )}
    </>
  );
}
