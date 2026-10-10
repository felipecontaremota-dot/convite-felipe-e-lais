import { friendlyError } from "../lib/errors";
import type { OfflineMutation } from "../types/domain";
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface SyncResult {
  initial: number;
  synced: number;
  remaining: number;
  firstFailure: OfflineMutation | null;
  message: string;
}
export class MutationQueue {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    private storage: KeyValueStorage,
    private key: string,
  ) {}
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
  async list(): Promise<OfflineMutation[]> {
    return JSON.parse((await this.storage.getItem(this.key)) || "[]");
  }
  enqueue(item: OfflineMutation) {
    return this.serialized(async () => {
      const items = await this.list();
      if (!items.some((x) => x.mutationId === item.mutationId))
        await this.storage.setItem(this.key, JSON.stringify([...items, item]));
    });
  }
  flushDetailed(
    send: (item: OfflineMutation) => Promise<void>,
  ): Promise<SyncResult> {
    return this.serialized(async () => {
      const items = await this.list();
      const initial = items.length;
      while (items.length) {
        const current = items[0]!;
        try {
          await send(current);
          items.shift();
          await this.storage.setItem(this.key, JSON.stringify(items));
        } catch (error) {
          current.attempts++;
          current.lastError = friendlyError(error);
          await this.storage.setItem(this.key, JSON.stringify(items));
          break;
        }
      }
      const synced = initial - items.length;
      const syncedText = `${synced} ${synced === 1 ? "alteração sincronizada" : "alterações sincronizadas"}`;
      return {
        initial,
        synced,
        remaining: items.length,
        firstFailure: items.find((i) => i.lastError) || null,
        message: items.length
          ? `${syncedText}; ${items.length} restantes.`
          : `${syncedText}. Nenhuma alteração pendente.`,
      };
    });
  }
  async flush(send: (item: OfflineMutation) => Promise<void>) {
    await this.flushDetailed(send);
    return this.list();
  }
  discardFailed(mutationId: string) {
    return this.serialized(async () => {
      const items = await this.list();
      const found = items.find((i) => i.mutationId === mutationId);
      if (!found?.lastError)
        throw Error("Only failed changes may be discarded");
      await this.storage.setItem(
        this.key,
        JSON.stringify(items.filter((i) => i.mutationId !== mutationId)),
      );
    });
  }
  clear() {
    return this.serialized(() => this.storage.removeItem(this.key));
  }
}
