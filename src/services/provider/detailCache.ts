import { cacheState, hydrateCache, readCache, writeCache } from "@/services/cache/swr";
import type { TitleDetail } from "@/types/provider";
import { fetchDetail } from "./adapter";

/**
 * Instant 0ms Stale-While-Revalidate cache for TitleDetail payloads.
 * Opening any Featured Hero title or previously visited drama renders
 * immediately from memory/disk while fresh episode counts revalidate quietly.
 */

const DETAIL_TTL_MS = 20 * 60 * 1000;
const KEY_PREFIX = "hallyu.detail.v3.";
const inflightDetails = new Map<string, Promise<TitleDetail>>();
let focusPrefetchTimer: ReturnType<typeof setTimeout> | null = null;

function keyFor(detailPath: string): string {
  return `${KEY_PREFIX}${detailPath}`;
}

/** Synchronous 0ms RAM lookup so Details screens can initialize state without a loading frame. */
export function peekCachedDetail(detailPath: string): TitleDetail | null {
  if (!detailPath) return null;
  return readCache<TitleDetail>(keyFor(detailPath))?.value ?? null;
}

/** Memory-then-disk hydration before network revalidation. */
export async function hydrateDetail(detailPath: string): Promise<TitleDetail | null> {
  if (!detailPath) return null;
  const entry = await hydrateCache<TitleDetail>(keyFor(detailPath));
  return entry?.value ?? null;
}

/** Fetch fresh detail (deduplicated when un-aborted) and persist to SWR cache. */
export async function loadDetailCached(detailPath: string, signal?: AbortSignal): Promise<TitleDetail> {
  const cached = readCache<TitleDetail>(keyFor(detailPath));
  if (cached && cacheState(cached, Date.now(), DETAIL_TTL_MS) === "fresh") {
    return cached.value;
  }

  if (signal) {
    const fresh = await fetchDetail(detailPath, signal);
    writeCache(keyFor(detailPath), fresh);
    return fresh;
  }

  const pending = inflightDetails.get(detailPath);
  if (pending) return pending;

  const task = fetchDetail(detailPath)
    .then((detail) => {
      writeCache(keyFor(detailPath), detail);
      return detail;
    })
    .finally(() => {
      inflightDetails.delete(detailPath);
    });

  inflightDetails.set(detailPath, task);
  return task;
}

/**
 * Pre-warms TitleDetail:
 * - `immediate = true` (on tap/click): fires immediately on frame 0 during navigation.
 * - `immediate = false` (default, on D-pad focus / hero hover): debounced by 420ms so
 *   rapid remote navigation never floods the network or competes with poster downloads.
 */
export function prefetchDetail(detailPath: string | null | undefined, immediate = false): void {
  if (!detailPath) return;
  const cached = readCache<TitleDetail>(keyFor(detailPath));
  if (cached && cacheState(cached, Date.now(), DETAIL_TTL_MS) === "fresh") return;

  if (immediate) {
    if (focusPrefetchTimer) {
      clearTimeout(focusPrefetchTimer);
      focusPrefetchTimer = null;
    }
    void loadDetailCached(detailPath).catch(() => {});
    return;
  }

  if (focusPrefetchTimer) clearTimeout(focusPrefetchTimer);
  focusPrefetchTimer = setTimeout(() => {
    focusPrefetchTimer = null;
    void loadDetailCached(detailPath).catch(() => {});
  }, 420);
}
