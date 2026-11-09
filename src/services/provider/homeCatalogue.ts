import { cacheState, hydrateCache, readCache, writeCache } from "@/services/cache/swr";
import type { CatalogueItem, HomeSection } from "@/types/provider";
import { fetchHome } from "./adapter";

/**
 * The home catalogue with a 0ms synchronous RAM cache + persistent SWR disk cache.
 *
 * - `peekHome()` reads RAM synchronously on frame 0 (0ms, zero skeleton flash!).
 * - `hydrateHome()` restores from AsyncStorage on cold boot.
 * - `loadHome(force)` skips redundant network fetches while fresh (3 min TTL)
 *   unless `force = true` (pull-to-refresh).
 * - `warmBootHome()` kicks off disk + network loading at module import time
 *   before React Navigation even finishes mounting!
 */

const KEY = "hallyu.cache.home.v3";
const FRESH_TTL_MS = 3 * 60 * 1000;

let bootPromise: Promise<HomeSection[]> | null = null;

export function peekHome(): HomeSection[] | null {
  const entry = readCache<HomeSection[]>(KEY);
  if (!entry || !Array.isArray(entry.value) || entry.value.length === 0) return null;
  return entry.value;
}

export function isHomeFresh(): boolean {
  const entry = readCache<HomeSection[]>(KEY);
  return (
    Boolean(entry && Array.isArray(entry.value) && entry.value.length > 0) &&
    cacheState(entry, Date.now(), FRESH_TTL_MS) === "fresh"
  );
}

export async function loadHome(force = false): Promise<HomeSection[]> {
  if (!force && isHomeFresh()) {
    const cached = peekHome();
    if (cached) return cached;
  }
  const sections = await fetchHome();
  if (sections.length > 0) {
    writeCache(KEY, sections);
  }
  return sections;
}

export async function hydrateHome(): Promise<HomeSection[] | null> {
  const mem = peekHome();
  if (mem) return mem;
  const entry = await hydrateCache<HomeSection[]>(KEY);
  if (!entry) return null;
  if (!Array.isArray(entry.value) || entry.value.length === 0) return null;
  return entry.value;
}

export function warmBootHome(): Promise<HomeSection[]> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    await hydrateHome().catch(() => null);
    return await loadHome(false);
  })().finally(() => {
    bootPromise = null;
  });
  return bootPromise;
}

/**
 * Curates up to `maxSlides` distinct, poster-backed Featured Dramas & Cinema
 * titles from the top Home sections for the auto-transitioning Hero Showcase.
 */
export function curateFeaturedItems(sections: HomeSection[], maxSlides = 6): CatalogueItem[] {
  const out: CatalogueItem[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    for (const item of section.items) {
      if (seen.has(item.subjectId) || !item.posterUrl) continue;
      seen.add(item.subjectId);
      out.push(item);
      if (out.length >= maxSlides) return out;
    }
  }
  return out;
}
