export type EnvelopePhase =
  "closed" | "seal" | "opening" | "open" | "extracting" | "revealed" | "flash";
export const envelopeTiming = {
  seal: 400,
  flap: 1100,
  extract: 2400,
  lightIn: 460,
  lightHold: 120,
  lightOut: 520,
} as const;
// Each promise resolves from the actual animation's finished event, not a launch delay.
export async function envelopeSequence(
  play: (
    step: "seal" | "flap" | "settle" | "letter" | "light",
  ) => Promise<void>,
  phase: (phase: EnvelopePhase) => void,
) {
  phase("seal");
  await play("seal");
  phase("opening");
  await play("flap");
  phase("open");
  await play("settle"); // Let the fully open flap paint before extraction.
  phase("extracting");
  await play("letter");
  phase("revealed");
  phase("flash");
  await play("light");
}
export async function playEnvelopeAnimation(
  element: HTMLElement,
  frames: Keyframe[],
  duration: number,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const end = frames.at(-1)!;
  const apply = () => {
    for (const key of ["transform", "opacity"] as const)
      if (end[key] != null) element.style[key] = String(end[key]);
  };
  if (typeof element.animate !== "function") {
    apply();
    return;
  }
  let animation: Animation | undefined;
  try {
    animation = element.animate(frames, {
      duration,
      easing: "cubic-bezier(.25,.65,.25,1)",
      fill: "forwards",
    });
  } catch {
    apply();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    // Failure recovery only: this watchdog never schedules a normal next stage.
    const timer = setTimeout(() => {
      apply();
      animation?.cancel();
      cleanup();
      resolve();
    }, duration + 1500);
    const abort = () => {
      animation?.cancel();
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    signal.addEventListener("abort", abort, { once: true });
    animation!.finished.then(
      () => {
        apply();
        cleanup();
        animation?.cancel();
        resolve();
      },
      () => {
        cleanup();
        if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
        else {
          apply();
          resolve();
        }
      },
    );
  });
}
