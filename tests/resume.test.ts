import { describe, expect, test } from "bun:test";
import { MIN_RESUME_SECONDS, isResumable, primaryActionLabel, resumeTargetFor } from "../src/services/library/resume";
import type { ProgressRow } from "../src/types/library";

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    subject_id: "subject-1",
    detail_path: "some-title",
    media_type: "movie",
    title: "A Title",
    poster_url: null,
    season_number: null,
    episode_number: null,
    position_seconds: 600,
    duration_seconds: 3600,
    completed: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("resume semantics", () => {
  test("an in-progress row is resumable", () => {
    expect(isResumable(row())).toBe(true);
  });

  test("a completed row is not resumable", () => {
    expect(isResumable(row({ completed: true }))).toBe(false);
  });

  test("progress below the threshold is not a resume point", () => {
    expect(isResumable(row({ position_seconds: MIN_RESUME_SECONDS - 1 }))).toBe(false);
  });

  test("a row at the very end is treated as finished even if not flagged", () => {
    expect(isResumable(row({ position_seconds: 3599, duration_seconds: 3600 }))).toBe(false);
  });

  test("a zero duration never marks a row finished", () => {
    expect(isResumable(row({ duration_seconds: 0, position_seconds: 900 }))).toBe(true);
  });

  test("the label and the behaviour can never disagree", () => {
    expect(primaryActionLabel(row())).toBe("Resume");
    expect(primaryActionLabel(row({ completed: true }))).toBe("Play");
    expect(primaryActionLabel(null)).toBe("Play");
  });

  test("resume target keeps the stored season, episode and position", () => {
    const target = resumeTargetFor(row({ season_number: 2, episode_number: 7, position_seconds: 1234.6, media_type: "series" }), 1, 1);
    expect(target).toEqual({ season: 2, episode: 7, positionSeconds: 1234 });
  });

  test("without progress the caller's default episode is used from the start", () => {
    expect(resumeTargetFor(null, 3, 4)).toEqual({ season: 3, episode: 4, positionSeconds: 0 });
  });

  test("a completed row restarts the requested episode, not the old position", () => {
    const target = resumeTargetFor(row({ completed: true, season_number: 1, episode_number: 5 }), 1, 1);
    expect(target).toEqual({ season: 1, episode: 1, positionSeconds: 0 });
  });
});
