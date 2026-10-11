import type { Credential, Ticket } from "../types/domain";
import { readCache, updateCache } from "../storage/driver";
import { hashToken } from "./demo";
import { AppError } from "../lib/errors";
const inflight = new Map<
  string,
  { regenerate: boolean; request: Promise<Ticket> }
>();
export function getDeviceTicket(
  scope: string,
  guest: string,
  credentials: Credential[],
  online: boolean,
  regenerate: boolean,
  issue: (regenerate: boolean) => Promise<Ticket>,
): Promise<Ticket> {
  const flightKey = `${scope}:${guest}`;
  const running = inflight.get(flightKey);
  if (running) {
    if (regenerate && !running.regenerate)
      return running.request
        .catch(() => undefined)
        .then(() =>
          getDeviceTicket(scope, guest, credentials, online, regenerate, issue),
        );
    return running.request;
  }
  const request = (async () => {
    const key = `tickets:${scope}`;
    if (regenerate && !online)
      throw new AppError("Conecte-se para gerar um novo convite.");
    const existing = (await readCache<Ticket[]>(key))?.find(
      (t) => t.guest_id === guest,
    );
    if (existing && !regenerate) {
      const hash = await hashToken(existing.token);
      if (
        credentials.some(
          (c) => c.guest_id === guest && c.token_hash === hash && !c.revoked_at,
        )
      )
        return existing;
      await updateCache<Ticket[]>(key, (items) =>
        (items || []).filter((t) => t.guest_id !== guest),
      );
    }
    if (!online)
      throw new AppError("Conecte-se para emitir ou atualizar este convite.");
    const next = await issue(regenerate);
    await updateCache<Ticket[]>(key, (items) => [
      ...(items || []).filter((t) => t.guest_id !== guest),
      next,
    ]);
    return next;
  })();
  inflight.set(flightKey, { regenerate, request });
  return request.finally(() => {
    if (inflight.get(flightKey)?.request === request)
      inflight.delete(flightKey);
  });
}
