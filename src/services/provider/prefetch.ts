import type { CaptionTrack, StreamResolution } from "@/types/provider";
import { fetchCaptions, resolveStreams } from "./adapter";

/**
 * Parallel Stream + Subtitle Prefetch Engine.
 *
 * Pre-warms BOTH playable video URLs and multi-language caption tracks in
 * parallel (on Details open AND at 80% episode progress) so tapping Watch Now
 * or advancing to the next episode starts at 00:00 with subtitles already ready.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 12;

const streamEntries = new Map<string, { at: number; result: StreamResolution }>();
const captionEntries = new Map<string, { at: number; tracks: CaptionTrack[] }>();
const inflightStreams = new Set<string>();
const inflightCaptions = new Set<string>();

function keyFor(subjectId: string, detailPath: string, season: number, episode: number): string {
  return `${subjectId}|${detailPath}|${season}|${episode}`;
}

function trimMap<T extends { at: number }>(map: Map<string, T>): void {
  if (map.size <= MAX_ENTRIES) return;
  const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldest.slice(0, map.size - MAX_ENTRIES)) map.delete(key);
}

/** Consume a prefetched stream resolution once; stale or absent entries return null. */
export function takePrefetched(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): StreamResolution | null {
  const key = keyFor(subjectId, detailPath, season, episode);
  const entry = streamEntries.get(key);
  if (!entry) return null;
  streamEntries.delete(key);
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.result;
}

/** Read prefetched caption tracks if warm in RAM. */
export function takePrefetchedCaptions(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): CaptionTrack[] | null {
  const key = keyFor(subjectId, detailPath, season, episode);
  const entry = captionEntries.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    captionEntries.delete(key);
    return null;
  }
  return entry.tracks;
}

/** Warm caption tracks in the background without blocking video start. */
export function prefetchCaptions(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): void {
  if (!subjectId || !detailPath) return;
  const key = keyFor(subjectId, detailPath, season, episode);
  const existing = captionEntries.get(key);
  if (existing && Date.now() - existing.at <= TTL_MS) return;
  if (inflightCaptions.has(key)) return;

  inflightCaptions.add(key);
  void fetchCaptions(subjectId, detailPath, season, episode)
    .then((tracks) => {
      captionEntries.set(key, { at: Date.now(), tracks });
      trimMap(captionEntries);
    })
    .catch(() => {})
    .finally(() => {
      inflightCaptions.delete(key);
    });
}

/** Warm both stream URLs and caption tracks in parallel. Never throws. */
export function prefetchStreams(
  subjectId: string,
  detailPath: string,
  season: number,
  episode: number,
): void {
  if (!subjectId || !detailPath) return;
  const key = keyFor(subjectId, detailPath, season, episode);

  prefetchCaptions(subjectId, detailPath, season, episode);

  const existing = streamEntries.get(key);
  if (existing && Date.now() - existing.at <= TTL_MS) return;
  if (inflightStreams.has(key)) return;

  inflightStreams.add(key);
  void resolveStreams(subjectId, detailPath, season, episode)
    .then((result) => {
      streamEntries.set(key, { at: Date.now(), result });
      trimMap(streamEntries);
    })
    .catch(() => {})
    .finally(() => {
      inflightStreams.delete(key);
    });
}

export function clearPrefetched(): void {
  streamEntries.clear();
  captionEntries.clear();
  inflightStreams.clear();
  inflightCaptions.clear();
}
