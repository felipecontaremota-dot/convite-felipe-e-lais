import { createContext, useContext, useState, type ReactNode } from "react";
import { useApp } from "../../lib/AppProvider";
const Context = createContext({
  open: false,
  invitation: null as string | null,
  anchor: null as string | null,
  show: (_invitation?: string, _anchor?: string) => {},
  close: () => {},
});
export function MessageCenterProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [state, setState] = useState({
    scope: app.scope,
    role: app.data?.role,
    open: false,
    invitation: null as string | null,
    anchor: null as string | null,
  });
  const active = state.scope === app.scope && state.role === app.data?.role;
  if (!active)
    setState({
      scope: app.scope,
      role: app.data?.role,
      open: false,
      invitation: null,
      anchor: null,
    });
  return (
    <Context.Provider
      value={{
        open: active && state.open,
        invitation: active ? state.invitation : null,
        anchor: active ? state.anchor : null,
        show: (id, anchor) => {
          if (app.data?.role !== "ADMIN") return;
          setState({
            scope: app.scope,
            role: app.data.role,
            open: true,
            invitation: id || null,
            anchor: anchor || null,
          });
        },
        close: () => setState((s) => ({ ...s, open: false })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useMessageCenter = () => useContext(Context);
