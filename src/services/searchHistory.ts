import AsyncStorage from "@react-native-async-storage/async-storage";

const SEARCH_HISTORY_KEY = "hallyu.search.history.v1";
export const MAX_RECENT_SEARCHES = 10;

export function normalizeSearchHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= MAX_RECENT_SEARCHES) break;
  }
  return out;
}

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? normalizeSearchHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return loadRecentSearches();
  const current = await loadRecentSearches();
  const next = normalizeSearchHistory([trimmed, ...current]);
  try {
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function removeRecentSearch(query: string): Promise<string[]> {
  const target = query.trim().toLowerCase();
  const current = await loadRecentSearches();
  const next = current.filter((item) => item.toLowerCase() !== target);
  try {
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function clearRecentSearches(): Promise<string[]> {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {}
  return [];
}
