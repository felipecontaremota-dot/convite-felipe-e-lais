import type { ReactNode } from "react";
// Native applications do not offer browser PWA installation.
export function InstallProvider({ children }: { children: ReactNode }) {
  return children;
}
