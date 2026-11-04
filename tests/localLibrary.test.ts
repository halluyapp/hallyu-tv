import { describe, expect, test } from "bun:test";
import {
  clearProgressForSubject,
  emptyLibrary,
  latestProgressFor,
  normalizeLibrary,
  toggleWatchlistItem,
  upsertProgress,
} from "../src/services/localLibrary";
import type { LibraryTitle, ProgressRow } from "../src/types/library";

const title: LibraryTitle = {
  subject_id: "478",
  detail_path: "dead-end-job-oAmYsY887H5",
  media_type: "series",
  title: "Dead-End Job",
  poster_url: null,
};

function progress(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    ...title,
    season_number: 1,
    episode_number: 1,
    position_seconds: 100,
    duration_seconds: 2679,
    completed: false,
    updated_at: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("local library", () => {
  test("watchlist toggles on and off without a backend", () => {
    let snap = emptyLibrary();
    snap = toggleWatchlistItem(snap, title);
    expect(snap.watchlist).toHaveLength(1);
    snap = toggleWatchlistItem(snap, title);
    expect(snap.watchlist).toHaveLength(0);
  });

  test("progress upserts by subject/season/episode and sorts newest first", () => {
    let snap = emptyLibrary();
    snap = upsertProgress(snap, progress({ episode_number: 1, position_seconds: 10 }));
    snap = upsertProgress(snap, progress({ episode_number: 2, position_seconds: 20, updated_at: "2026-11-03T01:00:00.000Z" }));
    snap = upsertProgress(snap, progress({ episode_number: 1, position_seconds: 30, updated_at: "2026-11-03T02:00:00.000Z" }));
    expect(snap.progress).toHaveLength(2);
    expect(snap.progress[0]!.episode_number).toBe(1);
    expect(snap.progress[0]!.position_seconds).toBe(30);
  });

  test("latestProgressFor returns the newest row for a subject", () => {
    const rows = [
      progress({ episode_number: 1, updated_at: "2026-11-03T00:00:00.000Z" }),
      progress({ episode_number: 2, updated_at: "2026-11-03T03:00:00.000Z" }),
    ];
    expect(latestProgressFor(rows, "478")!.episode_number).toBe(2);
    expect(latestProgressFor(rows, "missing")).toBeNull();
  });

  test("clearProgress removes every episode for a subject", () => {
    let snap = upsertProgress(emptyLibrary(), progress({ episode_number: 1 }));
    snap = upsertProgress(snap, progress({ episode_number: 2 }));
    snap = clearProgressForSubject(snap, "478");
    expect(snap.progress).toHaveLength(0);
  });

  test("normalizeLibrary drops malformed rows and keeps valid ones", () => {
    const snap = normalizeLibrary({
      watchlist: [title, { subject_id: "bad" }, null],
      progress: [progress(), { ...progress(), position_seconds: "nope" }, { title: "x" }],
    });
    expect(snap.watchlist).toHaveLength(1);
    expect(snap.progress).toHaveLength(1);
  });

  test("normalizeLibrary tolerates non-object input", () => {
    expect(normalizeLibrary(null)).toEqual(emptyLibrary());
    expect(normalizeLibrary("garbage")).toEqual(emptyLibrary());
  });
});
