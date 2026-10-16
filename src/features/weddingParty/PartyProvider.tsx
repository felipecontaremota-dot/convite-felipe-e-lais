import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../lib/AppProvider";
import * as api from "../../repositories/api";
import * as demo from "../../repositories/demo";
import type { PartyState } from "./types";
const Context = createContext<{
  state: PartyState;
  loading: boolean;
  refresh: () => Promise<unknown>;
  respond: (action: "ACCEPT" | "COMPLETE") => Promise<void>;
} | null>(null);
export function PartyProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const profile = app.data?.profile_confirmation;
  const eligible =
    app.data?.role === "GUEST" &&
    !!profile?.guest_id &&
    !!profile.confirmed_at &&
    app.online;
  const query = useQuery({
    queryKey: ["party-state", app.scope, profile?.guest_id],
    queryFn: app.isDemo ? demo.demoPartyState : api.weddingPartyState,
    enabled: eligible,
    staleTime: 0,
    refetchInterval: 15000,
    retry: false,
  });
  // Cached classification never grants access after a failed check or while offline.
  const state: PartyState =
    eligible && !query.isError
      ? (query.data ?? { promotion: null })
      : { promotion: null };
  const respond = async (action: "ACCEPT" | "COMPLETE") => {
    if (!state.promotion || !app.online)
      throw Error("Conecte-se para continuar.");
    if (app.isDemo)
      await demo.demoPartyRespond(state.promotion.cycle_id, action);
    else await api.weddingPartyRespond(state.promotion.cycle_id, action);
    const result = await query.refetch();
    if (
      result.error ||
      !result.data?.promotion ||
      result.data.promotion.cycle_id !== state.promotion.cycle_id
    )
      throw Error("Este acesso não está mais disponível.");
  };
  return (
    <Context.Provider
      value={{
        state,
        loading: eligible && query.isPending,
        refresh: query.refetch,
        respond,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useParty() {
  const value = useContext(Context);
  if (!value) throw Error("PartyProvider required");
  return value;
}
