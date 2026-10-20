import { useEffect, useRef } from "react";
export const PARAGRAPH_REVEAL_MS = 1350; // Previous 850 ms + requested 500 ms.
export function useLetterReading(reduced: boolean) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const article = root.current;
    if (!article) return;
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: "start", behavior: "auto" });
    if (reduced || typeof IntersectionObserver !== "function") return;
    const nodes = Array.from(
      article.querySelectorAll<HTMLElement>("[data-letter-paragraph]"),
    );
    let observer: IntersectionObserver | undefined,
      frame = 0,
      previous = article.getBoundingClientRect().top,
      enabled = true;
    const seen = new Set<HTMLElement>();
    const restore = () => {
      enabled = false;
      article.removeAttribute("data-reading-ready");
      for (const n of nodes) n.removeAttribute("data-read-state");
    };
    const update = () => {
      frame = 0;
      if (!enabled) return;
      try {
        const current = article.getBoundingClientRect().top;
        const direction =
          current > previous + 1
            ? "up"
            : current < previous - 1
              ? "down"
              : "still";
        previous = current;
        const line = innerHeight * 0.9;
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (rect.top <= line - 16 || rect.bottom <= 0) {
            seen.add(node);
            node.dataset.readState = "shown";
          } else if (
            rect.top >= line + 32 &&
            (direction === "up" || !seen.has(node))
          )
            node.dataset.readState = "hidden";
        }
        article.dataset.readingReady = "true";
      } catch {
        restore();
      }
    };
    const schedule = () => {
      if (enabled && !frame) frame = requestAnimationFrame(update);
    };
    try {
      observer = new IntersectionObserver(schedule, {
        threshold: [0, 0.1, 1],
        rootMargin: "0px 0px -10% 0px",
      });
      nodes.forEach((node) => observer!.observe(node));
      document.addEventListener("scroll", schedule, true);
      window.addEventListener("resize", schedule);
      update();
    } catch {
      observer?.disconnect();
      restore();
    }
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      restore();
    };
  }, [reduced]);
  return root;
}
