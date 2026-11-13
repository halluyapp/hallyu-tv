import { webStorage } from "@/services/storage/webStorage";

/**
 * Stale-while-revalidate cache.
 *
 * A streaming app must never show an empty wall because the network is slow.
 * The last known catalogue paints instantly from memory or disk, then the
 * network refreshes it. This is the difference between "the app opened" and
 * "the app is loading" on a 2 Mbps connection.
 */

export interface CacheEntry<T> {
  value: T;
  at: number;
}

export type CacheState = "fresh" | "stale" | "empty";

export function cacheState(entry: CacheEntry<unknown> | null, now: number, ttlMs: number): CacheState {
  if (!entry) return "empty";
  return now - entry.at <= ttlMs ? "fresh" : "stale";
}

const memory = new Map<string, CacheEntry<unknown>>();

export function readCache<T>(key: string): CacheEntry<T> | null {
  const entry = memory.get(key);
  return entry ? (entry as CacheEntry<T>) : null;
}

export function writeCache<T>(key: string, value: T, now: number = Date.now()): CacheEntry<T> {
  const entry: CacheEntry<T> = { value, at: now };
  memory.set(key, entry as CacheEntry<unknown>);
  void webStorage.setItem(key, JSON.stringify(entry)).catch(() => {});
  return entry;
}

/** Memory first, then disk. Returns stale entries too — callers revalidate. */
export async function hydrateCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const cached = readCache<T>(key);
  if (cached) return cached;
  try {
    const raw = await webStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as Partial<CacheEntry<T>>;
    if (typeof entry.at !== "number" || entry.value === undefined) return null;
    const restored: CacheEntry<T> = { value: entry.value, at: entry.at };
    memory.set(key, restored as CacheEntry<unknown>);
    return restored;
  } catch {
    return null;
  }
}
