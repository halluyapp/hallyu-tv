/**
 * Stale-while-revalidate cache + in-flight de-duplication for catalogue reads.
 *
 * Scope is deliberately narrow:
 *  - `/home` and `/detail/{slug}` are cached (they change slowly).
 *  - Search and **stream/caption URLs are never cached here** — stream URLs are
 *    signed and expire, so caching them would hand the player a dead link.
 *
 * Two problems this fixes, both observed in the audit:
 *  1. Home, Explore and TV Home each called `/home` independently on cold start.
 *  2. Returning to a tab re-fetched data that was still perfectly fresh.
 *
 * Pure and dependency-free so it is unit-testable without a React tree.
 */

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export interface CacheTuning {
  /** Data is considered fresh for this long; no network call at all. */
  freshMs: number;
  /** Data may still be shown for this long while revalidating in the background. */
  staleMs: number;
}

export const CACHE_TUNING = {
  home: { freshMs: 90_000, staleMs: 30 * 60_000 },
  detail: { freshMs: 10 * 60_000, staleMs: 6 * 60 * 60_000 },
} as const satisfies Record<string, CacheTuning>;

export type CacheBucket = keyof typeof CACHE_TUNING;

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function keyFor(bucket: CacheBucket, id: string): string {
  return `${bucket}:${id}`;
}

export function clearCache(): void {
  store.clear();
  inflight.clear();
}

export function peek<T>(bucket: CacheBucket, id: string): { value: T; ageMs: number } | null {
  const entry = store.get(keyFor(bucket, id)) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return { value: entry.value, ageMs: Date.now() - entry.storedAt };
}

export function write<T>(bucket: CacheBucket, id: string, value: T): void {
  store.set(keyFor(bucket, id), { value, storedAt: Date.now() });
}

/** Drop one entry (e.g. after a user-initiated pull-to-refresh). */
export function forget(bucket: CacheBucket, id: string): void {
  store.delete(keyFor(bucket, id));
}

/**
 * Read-through with de-duplication.
 *
 * - Inside `freshMs`: returns cached data, no network.
 * - Between fresh and stale: returns cached data immediately and refreshes in
 *   the background; `onBackground` receives the newer value when it lands.
 * - Gone or expired: awaits the network. Concurrent callers share one request.
 */
export async function cached<T>(
  bucket: CacheBucket,
  id: string,
  loader: () => Promise<T>,
  opts: { force?: boolean; onBackground?: (value: T) => void } = {},
): Promise<T> {
  const tuning = CACHE_TUNING[bucket];
  const existing = peek<T>(bucket, id);

  if (existing && !opts.force) {
    if (existing.ageMs < tuning.freshMs) return existing.value;
    if (existing.ageMs < tuning.staleMs) {
      // Serve stale instantly, revalidate quietly. Errors keep the stale copy.
      void loadShared(bucket, id, loader)
        .then((fresh) => opts.onBackground?.(fresh))
        .catch(() => {});
      return existing.value;
    }
  }

  return loadShared(bucket, id, loader);
}

/** One network request per (bucket,id) no matter how many callers ask. */
function loadShared<T>(bucket: CacheBucket, id: string, loader: () => Promise<T>): Promise<T> {
  const key = keyFor(bucket, id);
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then((value) => {
      write(bucket, id, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Test seam. */
export function _inflightCount(): number {
  return inflight.size;
}
