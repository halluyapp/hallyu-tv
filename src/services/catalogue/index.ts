import { hydrateCache, writeCache } from "@/services/cache/swr";
import { fetchHomeCatalogue, searchCatalogue, type SearchPage } from "@/services/provider/adapter";
import { ProviderError } from "@/types/provider";
import type { CatalogueItem, HomeSection } from "@/types/provider";
import { emptyReport, type NormalizeReport } from "./normalize";
import { harvestCatalogue } from "./harvest";
import {
  BROWSE_WORLDS,
  GENRE_SHELF_ORDER,
  applyFilters,
  isBlockedItem,
  isDubbedItem,
  isOriginalAudio,
  matchesGenre,
  matchesWorld,
  providerWorldFor,
  sortByRating,
  sortByYear,
  uniqueItems,
  type CatalogueFilters,
  type WorldKey,
  type WorldMembership,
} from "./worlds";

/**
 * The shared catalogue.
 *
 * One snapshot feeds the mobile tabs and the 10-foot TV stack: normalized
 * provider sections, derived collections, a de-duplicated index used for
 * browsing, and the discovery vocabulary (worlds, genres, countries).
 *
 * Two rules drive every shelf here:
 *   1. A shelf only exists if its items exist. Nothing is padded to fill a UI.
 *   2. Ranking labels ("Trending", "Top Rated") only ever wrap provider order or
 *      an actual rating/year sort. No arbitrary collection is dressed up.
 */

export const CATALOGUE_VERSION = 2;
const CACHE_KEY = "hallyu.cache.catalogue.v2";

export interface CatalogueShelf {
  key: string;
  title: string;
  /** Truthful qualifier, e.g. "Hindi dub" for provider-dub collections. */
  subtitle: string | null;
  items: CatalogueItem[];
  kind: "provider" | "derived";
}

export interface CatalogueWorld {
  key: WorldKey;
  label: string;
  items: CatalogueItem[];
}

export interface CatalogueStats {
  rawSections: number;
  mergedSections: number;
  sections: number;
  items: number;
  browseableItems: number;
  harvestItems: number;
  harvestRequests: number;
  harvestFailures: number;
  withGenre: number;
  withCountry: number;
  dubbed: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
}

export interface CatalogueSnapshot {
  version: number;
  at: number;
  sections: HomeSection[];
  shelves: CatalogueShelf[];
  hero: CatalogueItem[];
  index: CatalogueItem[];
  worlds: CatalogueWorld[];
  genres: string[];
  countries: string[];
  membership: WorldMembership;
  stats: CatalogueStats;
}

export interface SnapshotInput {
  sections: HomeSection[];
  harvest?: CatalogueItem[];
  report?: NormalizeReport;
  rawSections?: number;
  mergedSections?: number;
  harvestRequests?: number;
  harvestFailures?: number;
  at?: number;
}

/** Provider worlds that are shown as their own shelves, preserving provider order. */
const PROVIDER_SHELF_KEYS = new Set([
  // "anime" is a fallback: the derived world wins when it has enough titles,
  // but a thin harvest must not hide the provider's own anime rail.
  "anime",
  "asian-dramas",
  "western-tv",
  "cinema",
  "top-series",
  "shorts",
]);

const SHELF_LIMIT = 20;
const GENRE_SHELF_MIN = 5;
/** A derived rail needs enough titles to be worth a row. */
const MIN_DERIVED_SHELF = 3;

function safe(items: CatalogueItem[]): CatalogueItem[] {
  return items.filter((item) => !isBlockedItem(item));
}

function take(items: CatalogueItem[], limit = SHELF_LIMIT): CatalogueItem[] {
  return items.slice(0, limit);
}

function ratingOf(item: CatalogueItem): number {
  const n = Number(item.rating);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(item: CatalogueItem): number {
  const n = Number(item.year);
  return Number.isFinite(n) ? n : 0;
}

/** Section membership so a provider world keeps its editorial identity. */
function membershipOf(sections: HomeSection[]): WorldMembership {
  const membership: WorldMembership = {};
  for (const section of sections) {
    const world = providerWorldFor(section.section);
    if (!world) continue;
    for (const item of section.items) {
      const list = membership[item.subjectId] ?? [];
      if (!list.includes(world.key)) list.push(world.key);
      membership[item.subjectId] = list;
    }
  }
  return membership;
}

function dubSubtitle(items: CatalogueItem[]): string | null {
  if (items.length === 0) return null;
  const dubbed = items.filter((item) => isDubbedItem(item)).length;
  if (dubbed / items.length < 0.6) return null;
  const languages = new Set(
    items
      .map((item) => (item.badge ?? "").trim())
      .filter((badge) => badge.length > 0 && /punjabi|tamil|telugu/i.test(badge)),
  );
  if (languages.size === 1) return `${Array.from(languages)[0]} dub`;
  return "Dubbed";
}

function shelf(
  key: string,
  title: string,
  items: CatalogueItem[],
  kind: CatalogueShelf["kind"],
  subtitle: string | null = null,
): CatalogueShelf | null {
  if (items.length === 0) return null;
  if (kind === "derived" && items.length < MIN_DERIVED_SHELF) return null;
  return { key, title, subtitle, items, kind };
}

/**
 * Build the snapshot from already-normalized data. Pure and deterministic, so
 * the organization rules are unit-tested without a network or a renderer.
 */
export function buildSnapshot(input: SnapshotInput): CatalogueSnapshot {
  const { sections, harvest = [] } = input;
  const at = input.at ?? Date.now();
  const report = input.report ?? emptyReport();
  const membership = membershipOf(sections);

  const sectionItems = sections.flatMap((section) => section.items);
  const index = safe(uniqueItems([...harvest, ...sectionItems]));

  const byWorld = (key: WorldKey): CatalogueItem[] =>
    sortByRating(index.filter((item) => matchesWorld(item, key, membership)));

  const maxYear = index.reduce((max, item) => Math.max(max, yearOf(item)), 0);

  const shelves: CatalogueShelf[] = [];
  // One rail per title: a derived world wins over a provider section with the
  // same name (otherwise Home shows "Anime" twice).
  const usedTitles = new Set<string>();
  const push = (entry: CatalogueShelf | null) => {
    if (!entry) return;
    const titleKey = entry.title.trim().toLowerCase();
    if (usedTitles.has(titleKey)) return;
    usedTitles.add(titleKey);
    shelves.push(entry);
  };

  // 1. Hot Picks — newest, highest rated originals (rating + year are real data).
  const freshCutoff = maxYear > 0 ? maxYear - 1 : 0;
  const hotOriginals = sortByRating(
    index.filter((item) => isOriginalAudio(item) && ratingOf(item) >= 7 && yearOf(item) >= freshCutoff),
  );
  const originals = sortByRating(index.filter((item) => isOriginalAudio(item)));
  const hotPicks =
    hotOriginals.length >= MIN_DERIVED_SHELF
      ? hotOriginals
      : originals.length >= MIN_DERIVED_SHELF
        ? originals
        : sortByRating(index);
  push(shelf("hot-picks", "Hot Picks", take(hotPicks), "derived"));

  // 2. Provider order is the only real trending signal we receive.
  const trendingSection = sections.find((section) => providerWorldFor(section.section)?.key === "trending");
  push(
    shelf(
      "trending",
      "Trending Now",
      take(safe(uniqueItems(trendingSection?.items ?? byWorld("trending")))),
      "provider",
    ),
  );

  push(shelf("new-releases", "New Releases", take(sortByYear(index)), "derived"));
  push(shelf("top-rated", "Top Rated", take(sortByRating(index)), "derived"));

  push(shelf("kdrama", "K-Drama", take(byWorld("kdrama")), "derived"));
  push(shelf("cdrama", "C-Drama", take(byWorld("cdrama")), "derived"));
  push(shelf("anime", "Anime", take(byWorld("anime")), "derived"));
  push(
    shelf(
      "hollywood",
      "Hollywood",
      take(uniqueItems(byWorld("hollywood").filter((item) => isOriginalAudio(item)).concat(byWorld("hollywood")))),
      "derived",
    ),
  );

  push(
    shelf(
      "popular-movies",
      "Popular Movies",
      take(sortByRating(index.filter((item) => item.mediaType === "movie"))),
      "derived",
    ),
  );
  push(
    shelf(
      "popular-series",
      "Popular Series",
      take(sortByRating(index.filter((item) => item.mediaType === "series"))),
      "derived",
    ),
  );

  const worldwide = sortByRating(index.filter((item) => Boolean(item.country) && isOriginalAudio(item)));
  push(shelf("popular-worldwide", "Popular Worldwide", take(worldwide.length >= 8 ? worldwide : sortByRating(index)), "derived"));

  // Genre collections, only where the live catalogue supports them.
  const genreCounts = new Map<string, CatalogueItem[]>();
  for (const item of index) {
    if (!item.genre) continue;
    for (const genre of item.genre.split(",")) {
      const name = genre.trim();
      if (!name) continue;
      const list = genreCounts.get(name) ?? [];
      list.push(item);
      genreCounts.set(name, list);
    }
  }
  const orderedGenres = [
    ...GENRE_SHELF_ORDER.filter((genre) => (genreCounts.get(genre)?.length ?? 0) >= GENRE_SHELF_MIN),
    ...Array.from(genreCounts.keys())
      .filter((genre) => !GENRE_SHELF_ORDER.includes(genre) && (genreCounts.get(genre)?.length ?? 0) >= GENRE_SHELF_MIN)
      .sort((a, b) => (genreCounts.get(b)?.length ?? 0) - (genreCounts.get(a)?.length ?? 0)),
  ];
  for (const genre of orderedGenres) {
    push(
      shelf(
        `genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        genre,
        take(sortByRating(uniqueItems(genreCounts.get(genre) ?? []))),
        "derived",
      ),
    );
  }

  // Provider dub worlds last: additional discovery, never the whole experience.
  for (const section of sections) {
    const world = providerWorldFor(section.section);
    if (!world || !PROVIDER_SHELF_KEYS.has(world.key)) continue;
    const items = take(safe(uniqueItems(section.items)));
    push(shelf(`section-${world.key}`, world.title, items, "provider", dubSubtitle(items)));
  }

  // Hero: originals first (the provider banner is entirely Hindi dub), then the
  // provider's own featured wall, then trending.
  const bannerSection = sections.find((section) => providerWorldFor(section.section)?.key === "featured");
  const heroOriginals = take(
    sortByRating(index.filter((item) => isOriginalAudio(item) && Boolean(item.country) && ratingOf(item) >= 6.5)),
    2,
  );
  const hero = uniqueItems([
    ...heroOriginals,
    ...safe(uniqueItems(bannerSection?.items ?? [])),
    ...safe(uniqueItems(trendingSection?.items ?? [])),
  ]).slice(0, 5);

  const worlds: CatalogueWorld[] = BROWSE_WORLDS.map((world) => ({
    key: world.key,
    label: world.label,
    items: sortByRating(index.filter((item) => matchesWorld(item, world.key, membership))),
  }));

  const genreTally = new Map<string, number>();
  for (const item of index) {
    if (!item.genre) continue;
    for (const genre of item.genre.split(",")) {
      const name = genre.trim();
      if (name) genreTally.set(name, (genreTally.get(name) ?? 0) + 1);
    }
  }
  const genres = Array.from(genreTally.entries())
    .filter(([, count]) => count >= GENRE_SHELF_MIN)
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  const countryTally = new Map<string, number>();
  for (const item of index) {
    const country = item.country?.trim();
    if (country) countryTally.set(country, (countryTally.get(country) ?? 0) + 1);
  }
  const countries = Array.from(countryTally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([country]) => country);

  return {
    version: CATALOGUE_VERSION,
    at,
    sections,
    shelves,
    hero,
    index,
    worlds,
    genres,
    countries,
    membership,
    stats: {
      rawSections: input.rawSections ?? sections.length,
      mergedSections: input.mergedSections ?? 0,
      sections: sections.length,
      items: index.length,
      browseableItems: index.filter((item) => !isBlockedItem(item)).length,
      harvestItems: harvest.length,
      harvestRequests: input.harvestRequests ?? 0,
      harvestFailures: input.harvestFailures ?? 0,
      withGenre: index.filter((item) => Boolean(item.genre)).length,
      withCountry: index.filter((item) => Boolean(item.country)).length,
      dubbed: index.filter((item) => isDubbedItem(item)).length,
      rejected: report.rejected,
      rejectionReasons: report.reasons,
    },
  };
}

function isUsableSnapshot(value: unknown): value is CatalogueSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<CatalogueSnapshot>;
  return (
    snapshot.version === CATALOGUE_VERSION &&
    Array.isArray(snapshot.shelves) &&
    Array.isArray(snapshot.index) &&
    Array.isArray(snapshot.worlds) &&
    typeof snapshot.at === "number"
  );
}

/** The last known catalogue, memory then disk. May be stale — revalidate. */
export async function hydrateCatalogue(): Promise<CatalogueSnapshot | null> {
  const entry = await hydrateCache<CatalogueSnapshot>(CACHE_KEY);
  if (!entry) return null;
  return isUsableSnapshot(entry.value) ? entry.value : null;
}

/**
 * Load the live catalogue and rewrite the cache.
 *
 * If `/home` fails but a cached snapshot exists, the cached catalogue is kept
 * instead of the app showing an empty wall — offline-first by design. If the
 * harvest fails, the provider sections still produce a complete Home.
 */
let inflight: Promise<CatalogueSnapshot> | null = null;

/**
 * Load the live catalogue, sharing one in-flight load between screens.
 * Home and Explore mount together on a cold start; they must not both fire the
 * home request and the harvest sweep.
 */
export function loadCatalogue(): Promise<CatalogueSnapshot> {
  if (inflight) return inflight;
  inflight = loadCatalogueOnce().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadCatalogueOnce(): Promise<CatalogueSnapshot> {
  let home;
  try {
    home = await fetchHomeCatalogue();
  } catch {
    const cached = await hydrateCatalogue();
    if (cached) return cached;
    throw new ProviderError("unavailable", "Could not reach the catalogue. Check your connection.");
  }

  // Paint immediately from home sections only. Harvest runs in the background
  // so the cold start isn't blocked by up to 10 extra search requests.
  const snapshot = buildSnapshot({
    sections: home.sections,
    harvest: [],
    report: home.report,
    rawSections: home.rawSections,
    mergedSections: home.mergedSections,
  });
  writeCache(CACHE_KEY, snapshot);

  void harvestCatalogue().then(async (harvestResult) => {
    const enriched = buildSnapshot({
      sections: home.sections,
      harvest: harvestResult.items,
      report: home.report,
      rawSections: home.rawSections,
      mergedSections: home.mergedSections,
      harvestRequests: harvestResult.requests,
      harvestFailures: harvestResult.failures,
    });
    writeCache(CACHE_KEY, enriched);
  });

  return snapshot;
}


/** Browse a world locally, with optional genre/type filters. */
export function browseCatalogue(
  snapshot: CatalogueSnapshot,
  filters: CatalogueFilters,
  page = 1,
  pageSize = 30,
): { items: CatalogueItem[]; total: number; hasMore: boolean } {
  const world = snapshot.worlds.find((entry) => entry.key === (filters.world ?? "all"));
  const base = applyFilters(world?.items ?? snapshot.index, { ...filters, world: "all" }, snapshot.membership).filter(
    (item) => !filters.genre || matchesGenre(item, filters.genre),
  );
  const start = (page - 1) * pageSize;
  return {
    items: base.slice(start, start + pageSize),
    total: base.length,
    hasMore: start + pageSize < base.length,
  };
}

/** Title search for the catalogue; Hindi/blocked items are filtered out. */
export async function searchTitles(
  query: string,
  page = 1,
  signal?: AbortSignal,
  perPage = 30,
): Promise<SearchPage> {
  const result = await searchCatalogue(query, page, signal, perPage);
  return {
    ...result,
    items: result.items.filter((item) => !isBlockedItem(item)),
  };
}
