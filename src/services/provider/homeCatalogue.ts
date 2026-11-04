import { hydrateCache, writeCache } from "@/services/cache/swr";
import type { HomeSection } from "@/types/provider";
import { fetchHome } from "./adapter";

/**
 * The home catalogue with an offline-first cache in front of it.
 *
 * `hydrateHome` paints the last known wall immediately (memory, then disk).
 * `loadHome` refreshes from the provider and rewrites the cache. Screens call
 * both: instant first frame, correct content a moment later.
 */

const KEY = "hallyu.cache.home.v1";

export async function loadHome(): Promise<HomeSection[]> {
  const sections = await fetchHome();
  writeCache(KEY, sections);
  return sections;
}

export async function hydrateHome(): Promise<HomeSection[] | null> {
  const entry = await hydrateCache<HomeSection[]>(KEY);
  if (!entry) return null;
  if (!Array.isArray(entry.value) || entry.value.length === 0) return null;
  return entry.value;
}
