import { createContext } from "react";
export const InstallContext = createContext({
  available: false,
  busy: false,
  install: () => {},
});
