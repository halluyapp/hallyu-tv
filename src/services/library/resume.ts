import type { ProgressRow } from "@/types/library";

/**
 * Resume semantics — pure, so the rule is testable and identical everywhere.
 *
 * The previous build had a Home hero button labelled "Resume" that simply opened
 * the details screen. A control must do what it says, so both Home surfaces and
 * Details now resolve the target through this module and the player flow.
 */

/** A row is resumable only if it has meaningful progress and is unfinished. */
export const MIN_RESUME_SECONDS = 5;

export function isResumable(row: ProgressRow | null | undefined): row is ProgressRow {
  if (!row) return false;
  if (row.completed) return false;
  if (!Number.isFinite(row.position_seconds)) return false;
  if (row.position_seconds < MIN_RESUME_SECONDS) return false;
  // Guard against a stored duration of 0 (never fetched) flagging as finished.
  if (row.duration_seconds > 0 && row.position_seconds / row.duration_seconds >= 0.98) return false;
  return true;
}

export interface ResumeTarget {
  season: number;
  episode: number;
  positionSeconds: number;
}

/**
 * What the primary action should do for a title.
 *
 * - A resumable row wins: we resume that exact episode at its stored position.
 * - Otherwise a series starts at the latest episode the user watched (from the
 *   top) so they continue the series rather than replaying S1E1.
 * - A movie starts at 0.
 */
export function resumeTargetFor(
  latest: ProgressRow | null | undefined,
  fallbackSeason: number,
  fallbackEpisode: number,
): ResumeTarget {
  if (isResumable(latest)) {
    return {
      season: latest.season_number ?? fallbackSeason,
      episode: latest.episode_number ?? fallbackEpisode,
      positionSeconds: Math.floor(latest.position_seconds),
    };
  }
  return { season: fallbackSeason, episode: fallbackEpisode, positionSeconds: 0 };
}

/** Label for the primary action, so text and behaviour can never disagree. */
export function primaryActionLabel(row: ProgressRow | null | undefined): "Resume" | "Play" {
  return isResumable(row) ? "Resume" : "Play";
}
