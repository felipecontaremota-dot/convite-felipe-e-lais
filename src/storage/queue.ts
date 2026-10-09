import type { OfflineMutation } from "../types/domain";
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
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
  flush(send: (item: OfflineMutation) => Promise<void>) {
    return this.serialized(async () => {
      const items = await this.list();
      while (items.length) {
        const current = items[0]!;
        try {
          await send(current);
          items.shift();
          await this.storage.setItem(this.key, JSON.stringify(items));
        } catch (error) {
          current.attempts++;
          current.lastError =
            error instanceof Error ? error.message : "Falha ao sincronizar";
          await this.storage.setItem(this.key, JSON.stringify(items));
          break;
        }
      }
      return items;
    });
  }
  clear() {
    return this.serialized(() => this.storage.removeItem(this.key));
  }
}
