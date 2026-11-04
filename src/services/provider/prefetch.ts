import type { StreamResolution } from "@/types/provider";
import { resolveStreams } from "./adapter";

/**
 * Next-episode prefetch.
 *
 * Resolution is a network round trip followed by a fresh, short-lived CDN URL.
 * Doing it when the viewer is 80% through the current episode means the next
 * one starts instantly instead of showing "Preparing stream…" for a second and
 * a half. Entries expire because provider URLs are signed and time-limited.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 12;

const entries = new Map<string, { at: number; result: StreamResolution }>();
const inflight = new Set<string>();

function keyFor(subjectId: string, detailPath: string, season: number, episode: number): string {
  return `${subjectId}|${detailPath}|${season}|${episode}`;
}

function trim(): void {
  if (entries.size <= MAX_ENTRIES) return;
  const oldest = [...entries.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldest.slice(0, entries.size - MAX_ENTRIES)) entries.delete(key);
}

/** Consume a prefetched resolution once; stale or absent entries return null. */
export function takePrefetched(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): StreamResolution | null {
  const key = keyFor(subjectId, detailPath, season, episode);
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.result;
}

/** Warm the next episode in the background. Never throws, never blocks playback. */
export function prefetchStreams(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): void {
  const key = keyFor(subjectId, detailPath, season, episode);
  const existing = entries.get(key);
  if (existing && Date.now() - existing.at <= TTL_MS) return;
  if (inflight.has(key)) return;

  inflight.add(key);
  void resolveStreams(subjectId, detailPath, season, episode)
    .then((result) => {
      entries.set(key, { at: Date.now(), result });
      trim();
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(key);
    });
}

export function clearPrefetched(): void {
  entries.clear();
  inflight.clear();
}
