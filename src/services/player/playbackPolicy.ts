/**
 * Adaptive playback policy.
 *
 * There is no network-state library in this app, and there doesn't need to be:
 * the strongest signal available is the stream itself failing to keep up.
 * These rules turn observed stalls into a quality decision, so a weak link
 * degrades one rung at a time instead of freezing until the connection dies.
 *
 * Pure TypeScript — the player, tests and future diagnostics share one policy.
 */

import { selectableSources, type NormalizedSource } from "../provider/streams";

export const STALL_WINDOW_MS = 90_000;
export const STALLS_BEFORE_DOWNSHIFT = 2;
export const MIN_QUALITY = 360;

export function qualityNumber(label: string | null): number | null {
  if (!label) return null;
  const match = /(\d{3,4})\s*p?/i.exec(label.trim());
  return match ? Number(match[1]) : null;
}

export function recentStalls(stalls: number[], now: number, windowMs = STALL_WINDOW_MS): number {
  return stalls.filter((at) => now - at <= windowMs).length;
}

/** Two stalls inside the window means the current rung is not sustainable. */
export function shouldDownshift(stalls: number[], now: number): boolean {
  return recentStalls(stalls, now) >= STALLS_BEFORE_DOWNSHIFT;
}

/**
 * Pick a rung `dropSteps` below the current one, never below 480p while a
 * 480p+ rung exists. Returns null when the ladder carries no resolution info,
 * so callers fall back to the existing recovery rules instead of guessing.
 */
export function pickAdaptiveSource(
  sources: NormalizedSource[],
  currentResolution: string | null,
  dropSteps: number,
): NormalizedSource | null {
  const ladder = selectableSources(sources)
    .filter((source) => qualityNumber(source.resolution) !== null)
    .sort((a, b) => (qualityNumber(b.resolution) ?? 0) - (qualityNumber(a.resolution) ?? 0));
  if (ladder.length === 0) return null;

  const currentQuality = qualityNumber(currentResolution);
  const startIndex =
    currentQuality === null
      ? 0
      : Math.max(
          0,
          ladder.findIndex((source) => (qualityNumber(source.resolution) ?? 0) <= currentQuality),
        );

  const target = ladder[Math.min(ladder.length - 1, startIndex + Math.max(0, dropSteps))];
  if (!target) return null;
  if ((qualityNumber(target.resolution) ?? 0) >= MIN_QUALITY) return target;

  const floor = [...ladder].reverse().find((source) => (qualityNumber(source.resolution) ?? 0) >= MIN_QUALITY);
  return floor ?? ladder[ladder.length - 1] ?? null;
}
