import type { InstallStatus } from "./installBootstrap";
import { createContext } from "react";
export const InstallContext = createContext({
  status: "pending" as InstallStatus,
  promptAvailable: false,
  fallbackReason: null as InstallStatus | null,
  available: false,
  busy: false,
  install: () => {},
});
