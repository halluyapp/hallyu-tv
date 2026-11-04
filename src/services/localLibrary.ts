import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LibraryTitle, ProgressRow } from "@/types/library";

/**
 * Device-local library persistence. There is no account backend: each phone
 * and each TV keeps its own watchlist and resume points in AsyncStorage.
 */

export const LIBRARY_STORAGE_KEY = "hallyu.library.v1";
const MAX_WATCHLIST = 500;
const MAX_PROGRESS = 200;

export interface LibrarySnapshot {
  watchlist: LibraryTitle[];
  progress: ProgressRow[];
}

export function emptyLibrary(): LibrarySnapshot {
  return { watchlist: [], progress: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseTitle(v: unknown): LibraryTitle | null {
  if (!isRecord(v)) return null;
  const subject_id = str(v.subject_id);
  const title = str(v.title);
  if (!subject_id || !title) return null;
  return {
    subject_id,
    detail_path: str(v.detail_path),
    media_type: v.media_type === "series" ? "series" : "movie",
    title,
    poster_url: str(v.poster_url),
  };
}

function parseProgress(v: unknown): ProgressRow | null {
  const base = parseTitle(v);
  if (!base || !isRecord(v)) return null;
  const position = num(v.position_seconds);
  const duration = num(v.duration_seconds);
  if (position === null || duration === null || position < 0 || duration < 0) return null;
  return {
    ...base,
    season_number: num(v.season_number),
    episode_number: num(v.episode_number),
    position_seconds: position,
    duration_seconds: duration,
    completed: v.completed === true,
    updated_at: str(v.updated_at) ?? new Date(0).toISOString(),
  };
}

/** Tolerant hydration: malformed rows are dropped, never crash the app. */
export function normalizeLibrary(raw: unknown): LibrarySnapshot {
  if (!isRecord(raw)) return emptyLibrary();
  const watchlist = Array.isArray(raw.watchlist)
    ? raw.watchlist.map(parseTitle).filter((x): x is LibraryTitle => x !== null)
    : [];
  const progress = Array.isArray(raw.progress)
    ? raw.progress.map(parseProgress).filter((x): x is ProgressRow => x !== null)
    : [];
  return {
    watchlist: dedupeTitles(watchlist).slice(0, MAX_WATCHLIST),
    progress: sortProgress(progress).slice(0, MAX_PROGRESS),
  };
}

function dedupeTitles(items: LibraryTitle[]): LibraryTitle[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.subject_id) ? false : (seen.add(item.subject_id), true)));
}

function progressKey(row: Pick<ProgressRow, "subject_id" | "season_number" | "episode_number">): string {
  return `${row.subject_id}|${row.season_number ?? "m"}|${row.episode_number ?? "m"}`;
}

function sortProgress(rows: ProgressRow[]): ProgressRow[] {
  return [...rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function toggleWatchlistItem(snapshot: LibrarySnapshot, item: LibraryTitle): LibrarySnapshot {
  const exists = snapshot.watchlist.some((w) => w.subject_id === item.subject_id);
  const watchlist = exists
    ? snapshot.watchlist.filter((w) => w.subject_id !== item.subject_id)
    : [item, ...snapshot.watchlist.filter((w) => w.subject_id !== item.subject_id)];
  return { ...snapshot, watchlist: watchlist.slice(0, MAX_WATCHLIST) };
}

export function upsertProgress(snapshot: LibrarySnapshot, row: ProgressRow): LibrarySnapshot {
  const key = progressKey(row);
  const rest = snapshot.progress.filter((p) => progressKey(p) !== key);
  return { ...snapshot, progress: sortProgress([row, ...rest]).slice(0, MAX_PROGRESS) };
}

export function clearProgressForSubject(snapshot: LibrarySnapshot, subjectId: string): LibrarySnapshot {
  return { ...snapshot, progress: snapshot.progress.filter((p) => p.subject_id !== subjectId) };
}

export function latestProgressFor(progress: ProgressRow[], subjectId: string): ProgressRow | null {
  return sortProgress(progress.filter((p) => p.subject_id === subjectId))[0] ?? null;
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_STORAGE_KEY);
    return raw ? normalizeLibrary(JSON.parse(raw)) : emptyLibrary();
  } catch {
    return emptyLibrary();
  }
}

export async function saveLibrary(snapshot: LibrarySnapshot): Promise<void> {
  await AsyncStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(snapshot));
}
