import { loadEntrySnapshot, entryLoadMessage } from "../features/auth/entry";
import type { InvitationSendResult } from "../features/guests/invitationDelivery";
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
import { dispatchCommittedMessage } from "../features/messages/recipients";
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
  transientMutations: string[];
  scope: string;
  isDemo: boolean;
  demoLogin: (role: Role) => Promise<void>;
  enter: (code: string, pin: string) => Promise<void>;
  enterByName: (name: string, pin: string) => Promise<void>;
  resumeEntry: () => Promise<void>;
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
  syncNow: (messageMutationId?: string) => Promise<string>;
  profileMutation: (
    type: "PROFILE_IDENTIFY" | "PROFILE_CONFIRM",
    payload: Record<string, unknown>,
    mutationId: string,
  ) => Promise<void>;
  discardFailed: (id: string) => Promise<void>;
  sendInvitations: (
    request: string,
    guest?: string,
    supersedes?: string,
  ) => Promise<InvitationSendResult>;
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
  const [transientMutations, setTransientMutations] = useState<string[]>([]);
  const entryBusy = useRef(false);
  const entryEpoch = useRef(0);
  const entryTarget = useRef<string | null>(null);
  const legacyEntryCode = useRef<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [entryBlocked, setEntryBlocked] = useState(false);
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
      const epoch = entryEpoch.current;
      const data = demoRole
        ? await demo.demoSnapshot(demoRole)
        : await api.getSnapshot();
      if (epoch !== entryEpoch.current)
        throw new AppError("O acesso foi atualizado.");
      if (!data.role) {
        await queue.clear();
        setPending([]);
        await storage.removeItem(`tickets:${scope}`);
      }
      await writeCache(`cache:${scope}`, data);
      return data;
    },
    enabled:
      ready && online && !entering && !entryBlocked && (!!demoRole || !!user),
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
    if (entryBusy.current || !online || (!user && !demoRole)) {
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
      if (entryBusy.current)
        throw new AppError("Aguarde a conclusão do acesso.");
      if (demoRole) await demo.demoMutate(item, demoRole);
      else {
        const result = (await api.mutate(item)) as { id?: string };
        if (
          item.type === "MESSAGE_SEND_TO_GUESTS" ||
          item.type === "MESSAGE_REPLY" ||
          (item.type === "MESSAGE_SEND" && Array.isArray(item.payload.channels))
        ) {
          const summary = await dispatchCommittedMessage(
            result,
            (item.payload.channels as string[]) || [],
            api.dispatchMessage,
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
      if (
        online &&
        (user || demoRole) &&
        (Platform.OS !== "web" || document.visibilityState === "visible")
      )
        void sync().catch(() => undefined);
    }, 30000);
    return () => clearInterval(interval);
  }, [online, user, demoRole, sync]);
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (Date.now() - last < 2000 || !online) return;
      last = Date.now();
      void sync().catch(() => undefined);
    };
    if (Platform.OS === "web") {
      const visible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", visible);
      return () => {
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", visible);
      };
    }
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => listener.remove();
  }, [online, sync]);
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
  const base =
    !entering && !entryBlocked && (user || demoRole)
      ? query.data || cached
      : null;
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
        const confirmedRevocation =
          base?.contacts.find((c) => c.guest_id === p.guest_id)
            ?.communications_revoked ?? false;
        projected.contacts = projected.contacts.filter(
          (c) => c.guest_id !== p.guest_id,
        );
        projected.contacts.push({
          ...p,
          communications_revoked: confirmedRevocation,
        } as unknown as Snapshot["contacts"][number]);
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
  const finishEntry = async () => {
    if (!supabase)
      throw new AppError("Configure o Supabase para abrir o convite.");
    const session = await supabase.auth.getSession();
    const uid = session.data.session?.user.id;
    if (session.error || !uid)
      throw new AppError("Não foi possível carregar o convite.", "ENTRY_LOAD");
    const nextScope = `${eventId}:${uid}`;
    await queue.clear();
    await new MutationQueue(storage, `queue:${nextScope}`).clear();
    setPending([]);
    setCache(null);
    await client.cancelQueries({ queryKey: ["snapshot"] });
    client.removeQueries({ queryKey: ["snapshot"] });
    for (const oldScope of new Set([scope, nextScope])) {
      for (const prefix of ["cache", "tickets", "identity", "codes"])
        await storage.removeItem(`${prefix}:${oldScope}`);
    }
    setUser(uid);
    const snapshot = await loadEntrySnapshot(
      api.getSnapshot,
      eventId,
      entryTarget.current,
      !!legacyEntryCode.current,
    );
    if (legacyEntryCode.current) {
      try {
        const identity = await api.identifyInvitation(legacyEntryCode.current);
        if (
          !identity.activated ||
          identity.name !== snapshot.invitations[0]?.name
        )
          throw new AppError(entryLoadMessage, "ENTRY_LOAD");
      } catch {
        throw new AppError(entryLoadMessage, "ENTRY_LOAD");
      }
    }
    await writeCache(`cache:${nextScope}`, snapshot);
    setCache({ scope: nextScope, data: snapshot });
    client.setQueryData(["snapshot", nextScope, null], snapshot);
    setEntryBlocked(false);
  };
  const enterInvitation = async (
    redeem: () => Promise<api.LinkedInvitation>,
    legacyCode?: string,
  ) => {
    if (entryBusy.current) return;
    entryBusy.current = true;
    entryEpoch.current++;
    setEntering(true);
    try {
      await client.cancelQueries({ queryKey: ["snapshot"] });
      await queue.idle();
      const result = await redeem();
      if (result.linked !== true)
        throw new AppError("Não foi possível abrir o convite.");
      entryTarget.current = result.invitation_id || null;
      legacyEntryCode.current =
        !result.invitation_id && legacyCode ? legacyCode : null;
      setEntryBlocked(true);
      await finishEntry();
    } finally {
      entryBusy.current = false;
      setEntering(false);
    }
  };
  const value: ContextValue = {
    data: projected,
    loading: !ready || query.isLoading,
    error: query.error,
    scope,
    online,
    pending,
    transientMutations,
    isDemo: !!demoRole,
    refresh: async () => (user || demoRole ? query.refetch() : null),
    sync,
    syncNow: async (messageMutationId) => {
      const result = await sync();
      if (messageMutationId) {
        const left = await queue.list();
        if (left.some((m) => m.mutationId === messageMutationId))
          throw new SyncError("A mensagem continua pendente. Tente novamente.");
        return "Mensagem registrada.";
      }
      if (result.remaining)
        throw new SyncError(
          `${result.message} ${result.firstFailure?.lastError || "Tente novamente."}`,
        );
      return result.message;
    },
    profileMutation: async (type, payload, mutationId) => {
      if (!online)
        throw new AppError("Conecte-se à internet para confirmar seus dados.");
      if (
        entryBusy.current ||
        (query.data || cached)?.role !== "GUEST" ||
        !(query.data || cached)?.profile_confirmation?.supported
      )
        throw new AppError(
          "A confirmação cadastral ainda não está disponível.",
        );
      await queue.idle();
      if (
        type === "PROFILE_CONFIRM" &&
        (await queue.list()).some(
          (m) =>
            m.type === "CONTACT_UPDATE" &&
            m.payload.guest_id === payload.guest_id,
        )
      )
        throw new AppError(
          "Há uma alteração de contato pendente. Sincronize as alterações e carregue os dados novamente.",
        );
      const epoch = entryEpoch.current;
      // Online-only: no optimistic confirmation, no personal draft in the offline queue.
      const result = (await api.profileMutation(type, mutationId, payload)) as {
        ok?: boolean;
        guest_id?: string;
        profile_action?: string;
      };
      if (
        result?.ok !== true ||
        result.guest_id !== payload.guest_id ||
        result.profile_action !== type ||
        epoch !== entryEpoch.current
      )
        throw new AppError(
          "Não foi possível confirmar seus dados. Tente novamente.",
        );
      const refreshed = await query.refetch({ throwOnError: true });
      if (
        refreshed.data?.profile_confirmation?.guest_id !== payload.guest_id ||
        (type === "PROFILE_CONFIRM" &&
          !refreshed.data?.guests.find((g) => g.id === payload.guest_id)
            ?.profile_confirmed_at)
      )
        throw new AppError(
          "Não foi possível verificar a confirmação. Carregue os dados novamente.",
        );
    },
    discardFailed: async (id) => {
      await queue.discardFailed(id);
      setPending(await queue.list());
    },
    sendInvitations: async (request, guest, supersedes) => {
      if ((query.data || cached)?.role !== "ADMIN")
        throw new AppError("Acesso restrito.");
      if (!online) throw new AppError("O envio de convites exige conexão.");
      if (demoRole)
        return {
          message: "Demonstração: nenhum e-mail foi enviado.",
          complete: true,
          pending: 0,
          sent: 0,
          skipped: 1,
          failed: 0,
        };
      const result = await api.sendInvitations(request, guest, supersedes);
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
      const result = await api.identifyInvitation(code);
      if (result.activated) {
        // Link recovery may bind the registered responsible on the server.
        // Refresh and validate the snapshot before exposing the guest gate.
        await query.refetch({ throwOnError: true });
      }
      return result;
    },
    enter: async (code, pin) => {
      if (demoEnabled && code === demo.DEMO_CODE) {
        if (pin !== demo.DEMO_PIN) throw new AppError("Senha inválida.");
        await writeCache("demo-session", "GUEST");
        setDemoRole("GUEST");
        return;
      }
      await enterInvitation(() => api.redeem(code, pin), code);
    },
    enterByName: async (name, pin) => {
      if (demoEnabled && !supabase) {
        if (pin !== demo.DEMO_PIN || !name.trim())
          throw new AppError("Nome ou senha inválidos.");
        await writeCache("demo-session", "GUEST");
        setDemoRole("GUEST");
        return;
      }
      await enterInvitation(() => api.redeemByName(name, pin));
    },
    resumeEntry: async () => {
      if (entryBusy.current) return;
      entryBusy.current = true;
      entryEpoch.current++;
      setEntering(true);
      try {
        await finishEntry();
      } finally {
        entryBusy.current = false;
        setEntering(false);
      }
    },
    logout: async () => {
      entryEpoch.current++;
      await client.cancelQueries({ queryKey: ["snapshot"] });
      setEntryBlocked(false);
      entryTarget.current = null;
      legacyEntryCode.current = null;
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
      const transient =
        online &&
        [
          "MESSAGE_SEND",
          "MESSAGE_SEND_TO_GUESTS",
          "MESSAGE_REPLY",
          "MESSAGE_READ",
        ].includes(type);
      if (transient) setTransientMutations((ids) => [...ids, item.mutationId]);
      try {
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
            (type === "MESSAGE_SEND" ||
              type === "MESSAGE_SEND_TO_GUESTS" ||
              type === "MESSAGE_REPLY") &&
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
      } finally {
        if (transient)
          setTransientMutations((ids) =>
            ids.filter((id) => id !== item.mutationId),
          );
      }
    },
    admin: async (action, payload) => {
      if ((query.data || cached)?.role !== "ADMIN")
        throw new AppError("Acesso restrito.");
      if (!online)
        throw new AppError("Alterações administrativas exigem conexão.");
      const result = demoRole
        ? await demo.demoAdmin(action, payload)
        : await api.adminAction(action, payload);
      await query.refetch({
        throwOnError:
          action === "GUEST_RSVP_SET" || action === "GUEST_INVITATION_SENT_SET",
      });
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
