import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { theme } from "../../theme/tokens";
export function ChatWindow({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lock = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const root = document.documentElement,
      viewport = window.visualViewport;
    const update = () => {
      root.style.setProperty(
        "--chat-height",
        `${viewport?.height || innerHeight}px`,
      );
      root.style.setProperty("--chat-top", `${viewport?.offsetTop || 0}px`);
      root.style.setProperty(
        "--chat-bottom",
        innerHeight - (viewport?.height || innerHeight) > 100 ? "12px" : "90px",
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      for (const key of ["--chat-height", "--chat-top", "--chat-bottom"])
        root.style.removeProperty(key);
    };
  }, []);
  const close = () => {
    if (lock.current) return;
    lock.current = true;
    setClosing(true);
    const reduce =
      Platform.OS === "web" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(onClose, reduce ? 0 : 200);
  };
  return (
    <>
      {Platform.OS === "web" ? (
        <style>{`
 [data-chat-viewport="true"]{position:fixed!important;left:0!important;right:0!important;width:100%!important;top:var(--chat-top,0px)!important;height:var(--chat-height,100dvh)!important;
 padding-bottom:max(var(--chat-bottom,90px),env(safe-area-inset-bottom,0px))!important;
 padding-right:max(16px,env(safe-area-inset-right,0px))!important;padding-left:max(16px,env(safe-area-inset-left,0px))!important;background:${theme.colors.overlaySoft}!important;}
 [data-chat-dialog]{height:min(640px,calc(var(--chat-height,100dvh) - var(--chat-bottom,90px) - 20px));transform-origin:bottom right;box-shadow:0 16px 44px ${theme.colors.shadow}26;animation:wedding-chat-open 300ms cubic-bezier(.22,1,.36,1) both;max-height:calc(var(--chat-height,100dvh) - var(--chat-bottom,90px) - 20px)!important;}
 [data-chat-dialog] h1{font-size:18px!important;line-height:24px!important;}
 [data-chat-dialog="closing"]{animation:wedding-chat-close 200ms ease-in both;pointer-events:none;}
 @keyframes wedding-chat-open{from{opacity:0;transform:translateY(12px) scale(.94)}to{opacity:1;transform:none}}
 @keyframes wedding-chat-close{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.96)}}
 @media(prefers-reduced-motion:reduce){[data-chat-dialog]{animation:none!important;}}
 `}</style>
      ) : null}
      <AdminModal
        title={title}
        chat
        closing={closing}
        centerTitle
        onClose={close}
        footer={footer}
      >
        {children}
      </AdminModal>
    </>
  );
}
