import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";
import type {
  Snapshot,
  Role,
  OfflineMutation,
  MutationType,
  Ticket,
} from "../types/domain";
import { demoEnabled, supabase, eventId } from "./supabase";
import * as api from "../repositories/api";
import * as demo from "../repositories/demo";
import { MutationQueue, type SyncResult } from "../storage/queue";
import { storage, readCache, writeCache } from "../storage/driver";
import { AppError, SyncError } from "./errors";
import { getDeviceTicket } from "../repositories/tickets";
interface ContextValue {
  data: Snapshot | null;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<unknown>;
  online: boolean;
  pending: OfflineMutation[];
  scope: string;
  isDemo: boolean;
  demoLogin: (role: Role) => Promise<void>;
  enter: (code: string, pin: string) => Promise<void>;
  identify: (code: string) => Promise<{ name: string; activated: boolean }>;
  logout: () => Promise<void>;
  send: (
    type: MutationType,
    payload: Record<string, unknown>,
  ) => Promise<string>;
  admin: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  ticket: (guest: string, regenerate?: boolean) => Promise<Ticket>;
  sync: () => Promise<SyncResult>;
  syncNow: () => Promise<string>;
  discardFailed: (id: string) => Promise<void>;
  sendInvitations: (request: string, guest?: string) => Promise<string>;
}
const Context = createContext<ContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null),
    [demoRole, setDemoRole] = useState<Role | null>(null),
    [ready, setReady] = useState(!supabase),
    [online, setOnline] = useState(true),
    [pending, setPending] = useState<OfflineMutation[]>([]),
    [cache, setCache] = useState<{
      scope: string;
      data: Snapshot | null;
    } | null>(null);
  const scope = `${eventId}:${demoRole ? "demo-" + demoRole : user || "public"}`;
  const cached =
    (user || demoRole) && cache?.scope === scope ? cache.data : null;
  const queue = React.useMemo(
    () => new MutationQueue(storage, `queue:${scope}`),
    [scope],
  );
  const client = useQueryClient();
  const deliveryResults = useRef(new Map<string, string>());
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user.id || null);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user.id || null),
    );
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    return () => {
      subscription.unsubscribe();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (demoEnabled)
      void readCache<Role>("demo-session").then((role) => {
        if (role && ["GUEST", "ADMIN", "CEREMONIALIST"].includes(role))
          setDemoRole(role);
      });
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") {
      // NetworkInformation.change is not guaranteed for an online/offline transition.
      const update = () => setOnline(window.navigator.onLine);
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      update();
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }
    return NetInfo.addEventListener((state) =>
      setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      ),
    );
  }, []);
  const query = useQuery({
    queryKey: ["snapshot", scope, demoRole],
    queryFn: async () => {
      const data = demoRole
        ? await demo.demoSnapshot(demoRole)
        : await api.getSnapshot();
      if (!data.role) {
        await queue.clear();
        setPending([]);
        await storage.removeItem(`tickets:${scope}`);
      }
      await writeCache(`cache:${scope}`, data);
      return data;
    },
    enabled: ready && online && (!!demoRole || !!user),
    retry: 1,
  });
  useEffect(() => {
    let active = true;
    void readCache<Snapshot>(`cache:${scope}`).then((data) => {
      if (active) setCache({ scope, data });
    });
    void queue.list().then((items) => {
      if (active) setPending(items);
    });
    return () => {
      active = false;
    };
  }, [scope, queue]);
  const sync = useCallback(async () => {
    if (!online || (!user && !demoRole)) {
      const items = await queue.list();
      return {
        initial: items.length,
        synced: 0,
        remaining: items.length,
        firstFailure: items[0] || null,
        message: "Sem conexão. As alterações permanecem neste dispositivo.",
      };
    }
    const result = await queue.flushDetailed(async (item) => {
      if (demoRole) await demo.demoMutate(item, demoRole);
      else {
        const result = (await api.mutate(item)) as { id?: string };
        if (
          item.type === "MESSAGE_SEND_TO_GUESTS" ||
          (item.type === "MESSAGE_SEND" && Array.isArray(item.payload.channels))
        ) {
          const summary = await api.dispatchMessage(
            (item.payload.channels as string[]) || [],
            result.id,
          );
          deliveryResults.current.set(item.mutationId, summary);
          if (deliveryResults.current.size > 100)
            deliveryResults.current.delete(
              deliveryResults.current.keys().next().value!,
            );
        }
      }
    });
    setPending(await queue.list());
    await client.invalidateQueries({ queryKey: ["snapshot", scope] });
    return result;
  }, [online, user, demoRole, queue, client, scope]);
  useEffect(() => {
    void Promise.resolve()
      .then(sync)
      .catch(() => undefined);
  }, [sync]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (online && (user || demoRole)) void sync().catch(() => undefined);
    }, 30000);
    return () => clearInterval(interval);
  }, [online, user, demoRole, sync]);
  const refetch = query.refetch;
  const credentialState = JSON.stringify(
    (query.data || cached)?.credentials || [],
  );
  const ticket = useCallback(
    async (guest: string, regenerate = false): Promise<Ticket> => {
      const result = await getDeviceTicket(
        scope,
        guest,
        JSON.parse(credentialState),
        online,
        regenerate,
        async (rotate) =>
          demoRole
            ? demo.demoTicket(guest, rotate)
            : api.issueTicket(guest, rotate),
      );
      if (online) await refetch();
      return result;
    },
    [scope, credentialState, online, demoRole, refetch],
  );
  const base = user || demoRole ? query.data || cached : null;
  const projected = base
    ? (JSON.parse(JSON.stringify(base)) as Snapshot)
    : null;
  if (projected) {
    for (const mutation of pending) {
      const p = mutation.payload;
      if (mutation.type === "RSVP_UPDATE") {
        const row = projected.rsvps.find((r) => r.guest_id === p.guest_id);
        if (row)
          Object.assign(row, {
            status: p.status,
            dietary: p.dietary,
            note: p.note,
          });
      }
      if (mutation.type === "CONTACT_UPDATE") {
        projected.contacts = projected.contacts.filter(
          (c) => c.guest_id !== p.guest_id,
        );
        projected.contacts.push(p as unknown as Snapshot["contacts"][number]);
      }
      if (mutation.type === "GIFT_SELECT") {
        projected.gift_selections = projected.gift_selections.filter(
          (x) => !(x.guest_id === p.guest_id && x.gift_id === p.gift_id),
        );
        if (p.selected)
          projected.gift_selections.push({
            guest_id: String(p.guest_id),
            gift_id: String(p.gift_id),
          });
      }
    }
  }
  const value: ContextValue = {
    data: projected,
    loading: !ready || query.isLoading,
    error: query.error,
    scope,
    online,
    pending,
    isDemo: !!demoRole,
    refresh: async () => (user || demoRole ? query.refetch() : null),
    sync,
    syncNow: async () => {
      const result = await sync();
      if (result.remaining)
        throw new SyncError(
          `${result.message} ${result.firstFailure?.lastError || "Tente novamente."}`,
        );
      return result.message;
    },
    discardFailed: async (id) => {
      await queue.discardFailed(id);
      setPending(await queue.list());
    },
    sendInvitations: async (request, guest) => {
      if ((query.data || cached)?.role !== "ADMIN")
        throw new AppError("Acesso restrito.");
      if (!online) throw new AppError("O envio de convites exige conexão.");
      if (demoRole) return "Demonstração: nenhum e-mail foi enviado.";
      const result = await api.sendInvitations(request, guest);
      await query.refetch();
      return result;
    },
    demoLogin: async (role) => {
      if (!demoEnabled) throw new AppError("Demo indisponível em produção.");
      await writeCache("demo-session", role);
      setDemoRole(role);
    },
    identify: async (code) => {
      if (demoEnabled && code === demo.DEMO_CODE)
        return {
          name: "Família Demo",
          activated: (await readCache<Role>("demo-session")) === "GUEST",
        };
      return api.identifyInvitation(code);
    },
    enter: async (code, pin) => {
      if (demoEnabled && code === demo.DEMO_CODE) {
        if (pin !== demo.DEMO_PIN) throw new AppError("Senha inválida.");
        await writeCache("demo-session", "GUEST");
        setDemoRole("GUEST");
        return;
      }
      await api.redeem(code, pin);
      await queue.clear();
      setPending([]);
      setCache(null);
      client.removeQueries({ queryKey: ["snapshot"] });
      await storage.removeItem(`tickets:${scope}`);
      await client.invalidateQueries({ queryKey: ["snapshot"] });
    },
    logout: async () => {
      await storage.removeItem("demo-session");
      await queue.clear();
      await storage.removeItem(`cache:${scope}`);
      await storage.removeItem(`tickets:${scope}`);
      await storage.removeItem(`identity:${scope}`);
      await storage.removeItem(`codes:${scope}`);
      setCache(null);
      setPending([]);
      setDemoRole(null);
      if (supabase) await supabase.auth.signOut();
      setUser(null);
      client.clear();
    },
    send: async (type, payload) => {
      if (!demoRole && !user) throw new AppError("Abra seu convite primeiro.");
      const item: OfflineMutation = {
        mutationId: demo.id(),
        type,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
      };
      await queue.enqueue(item);
      setPending(await queue.list());
      if (online) {
        await sync();
        const left = await queue.list();
        if (left.some((m) => m.mutationId === item.mutationId))
          throw new AppError(
            "Salvo neste dispositivo. A sincronização falhou; tente novamente.",
          );
        if (
          (type === "MESSAGE_SEND" || type === "MESSAGE_SEND_TO_GUESTS") &&
          (query.data || cached)?.role === "ADMIN"
        ) {
          if (demoRole)
            return "Demonstração: mensagem registrada no aplicativo. Nenhum e-mail foi enviado.";
          const summary =
            deliveryResults.current.get(item.mutationId) ||
            "Mensagem registrada. O processamento está pendente.";
          deliveryResults.current.delete(item.mutationId);
          return summary;
        }
        return "Sincronizado com sucesso.";
      }
      return "Salvo neste dispositivo. Será sincronizado quando houver conexão.";
    },
    admin: async (action, payload) => {
      if ((query.data || cached)?.role !== "ADMIN")
        throw new AppError("Acesso restrito.");
      if (!online)
        throw new AppError("Alterações administrativas exigem conexão.");
      const result = demoRole
        ? await demo.demoAdmin(action, payload)
        : await api.adminAction(action, payload);
      await query.refetch();
      return result;
    },
    ticket,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw Error("AppProvider ausente");
  return value;
}
