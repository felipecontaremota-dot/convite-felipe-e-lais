import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useApp } from "../../lib/AppProvider";
import {
  retainedInvitationRequest,
  type InvitationSendResult,
} from "./invitationDelivery";

// Shared request retention and reconciliation for the guest screen and dashboard.
export function useInvitationDelivery() {
  const requests = useRef(new Map<string, string>());
  const acknowledged = useRef(new Set<string>());
  const overrides = useRef(new Map<string, string>());
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);

  const app = useApp();
  useEffect(() => {
    const history = app.data?.invitation_deliveries || [];
    for (const [key, request] of requests.current) {
      const rows = history.filter((d) => d.request_id === request);
      if (
        rows.length &&
        rows.every((d) => d.status !== "pending" || d.superseded_by)
      )
        requests.current.delete(key);
    }
    for (const delivery of history) {
      if (
        delivery.status !== "pending" ||
        delivery.superseded_by ||
        !delivery.request_id ||
        acknowledged.current.has(delivery.request_id)
      )
        continue;
      const keys = delivery.bulk
        ? ["bulk"]
        : (app.data?.guests || [])
            .filter(
              (g) =>
                (delivery.guest_ids || [delivery.guest_id]).includes(g.id) ||
                (g.invitation_id === delivery.invitation_id &&
                  app.data?.contacts.some(
                    (c) =>
                      c.guest_id === g.id &&
                      c.email.trim().toLowerCase() === delivery.recipient_email,
                  )),
            )
            .map((g) => g.id);
      for (const key of keys)
        if (!requests.current.has(key))
          requests.current.set(key, delivery.request_id);
    }
    setPendingKeys([...requests.current.keys()]);
  }, [app.data]);
  const deliver = async (
    guest?: string,
    onResult?: (result: InvitationSendResult) => void,
  ) => {
    const key = guest || "bulk";
    if (!requests.current.has(key)) {
      if (guest && requests.current.has("bulk"))
        return "Há um envio em massa com resultado não confirmado. Use Tentar novamente nessa operação antes de iniciar um envio individual.";
      if (!guest && requests.current.size)
        return "Há convites individuais com resultado não confirmado. Verifique essas operações antes de iniciar um envio em massa.";
    }
    let result;
    try {
      result = await retainedInvitationRequest(
        requests.current,
        key,
        Crypto.randomUUID,
        (request) =>
          app.sendInvitations(request, guest, overrides.current.get(request)),
      );
    } finally {
      setPendingKeys([...requests.current.keys()]);
    }
    onResult?.(result);
    return result.message;
  };
  return {
    requests,
    acknowledged,
    overrides,
    pendingKeys,
    setPendingKeys,
    overrideKey,
    setOverrideKey,
    deliver,
  };
}
