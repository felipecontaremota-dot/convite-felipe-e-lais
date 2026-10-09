import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { KeyValueStorage } from "./queue";
export const storage: KeyValueStorage = AsyncStorage;
// Only authentication credentials go to the encrypted native store. Web uses origin storage.
export const authStorage: KeyValueStorage =
  Platform.OS === "web"
    ? storage
    : {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) => SecureStore.setItemAsync(key, value),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      };
export async function readCache<T>(key: string): Promise<T | null> {
  const raw = await storage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
export const writeCache = (key: string, value: unknown) =>
  storage.setItem(key, JSON.stringify(value));

const cacheLocks = new Map<string, Promise<unknown>>();
export function updateCache<T>(
  key: string,
  update: (current: T | null) => T,
): Promise<void> {
  const previous = cacheLocks.get(key) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readCache<T>(key);
      await writeCache(key, update(current));
    });
  cacheLocks.set(key, next);
  return next.finally(() => {
    if (cacheLocks.get(key) === next) cacheLocks.delete(key);
  });
}
