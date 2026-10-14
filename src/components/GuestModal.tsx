import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminModal } from "./AdminModal";
import { useFxToast } from "./FxToastProvider";
export function GuestModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  onClose: () => void;
}) {
  const { reducedMotion } = useFxToast();
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const close = () => {
    if (lock.current) return;
    lock.current = true;
    setClosing(true);
    timer.current = setTimeout(onClose, reducedMotion ? 0 : 180);
  };
  return (
    <AdminModal
      title={title}
      premium
      closing={closing}
      closeOnOutside={false}
      onClose={close}
    >
      {/* eslint-disable-next-line react-hooks/refs -- This render callback only binds close to event handlers; it never invokes it during render. */}
      {typeof children === "function" ? children(close) : children}
    </AdminModal>
  );
}
