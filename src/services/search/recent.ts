import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Recent searches — device-local only, capped, deduplicated case-insensitively.
 * Same storage family as the rest of the app: no account, nothing synced.
 */
const KEY = "hallyu.recent_searches.v1";
const MAX = 8;

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, MAX);
  } catch {
    return [];
  }
}

/** Returns the new list so callers can update state without re-reading storage. */
export async function pushRecentSearch(term: string, existing: string[]): Promise<string[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return existing;
  const lower = trimmed.toLowerCase();
  const next = [trimmed, ...existing.filter((s) => s.toLowerCase() !== lower)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Losing a recent-search entry is not worth surfacing an error.
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
