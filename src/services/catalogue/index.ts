import { hydrateCache, writeCache } from "@/services/cache/swr";
import { fetchHomeCatalogue, searchCatalogue, type SearchPage } from "@/services/provider/adapter";
import type { CatalogueItem, HomeSection } from "@/types/provider";
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
  "bollywood",
  "south-indian",
  "indian-dramas",
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
      .filter((badge) => badge.length > 0 && /hindi|punjabi|tamil|telugu/i.test(badge)),
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
      take(byWorld("hollywood").filter((item) => isOriginalAudio(item)).concat(byWorld("hollywood"))),
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

import { HARVEST_SEEDS } from "./harvest";
import { normalizeHomeSections, normalizeItems, emptyReport, type NormalizeReport } from "./normalize";

/**
 * Load the live catalogue, sharing one in-flight load between screens.
 */
let inflight: Promise<CatalogueSnapshot> | null = null;

export function loadCatalogue(forceRefresh = false): Promise<CatalogueSnapshot> {
  if (inflight && !forceRefresh) return inflight;
  inflight = loadCatalogueOnce(forceRefresh).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function tryLoadFromAggregator(forceRefresh: boolean): Promise<CatalogueSnapshot | null> {
  if (typeof window === "undefined") return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(forceRefresh ? "/api/catalogue?refresh=1" : "/api/catalogue", {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;

    const payload = (await res.json()) as {
      at?: number;
      home?: unknown;
      seeds?: { query?: string; page?: number; raw?: unknown }[];
    };

    const rawHome = payload.home as Record<string, unknown> | undefined;
    const homeData = (rawHome && typeof rawHome.data === "object" && rawHome.data !== null
      ? rawHome.data
      : rawHome) as Record<string, unknown> | undefined;
    const rawSections = Array.isArray(homeData?.sections) ? homeData.sections : [];
    const { sections, report, mergedSections } = normalizeHomeSections(rawSections);

    const harvested: CatalogueItem[] = [];
    let requests = 0;
    let failures = 0;
    if (Array.isArray(payload.seeds)) {
      for (const seedEntry of payload.seeds) {
        requests += 1;
        if (!seedEntry.raw) {
          failures += 1;
          continue;
        }
        const seedSpec = HARVEST_SEEDS.find((s) => s.query === seedEntry.query);
        const r = seedEntry.raw as Record<string, unknown>;
        const data = (typeof r.data === "object" && r.data !== null ? r.data : r) as Record<string, unknown>;
        const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [];
        const { items } = normalizeItems(rawItems);
        harvested.push(...(seedSpec ? items.filter(seedSpec.keep) : items));
      }
    }

    return buildSnapshot({
      sections,
      harvest: uniqueItems(harvested),
      report,
      rawSections: rawSections.length,
      mergedSections,
      harvestRequests: requests,
      harvestFailures: failures,
      at: typeof payload.at === "number" ? payload.at : Date.now(),
    });
  } catch {
    return null;
  }
}

async function loadCatalogueOnce(forceRefresh = false): Promise<CatalogueSnapshot> {
  const aggregated = await tryLoadFromAggregator(forceRefresh);
  if (aggregated && (aggregated.sections.length > 0 || aggregated.index.length > 0)) {
    writeCache(CACHE_KEY, aggregated);
    return aggregated;
  }

  const [home, harvest] = await Promise.allSettled([fetchHomeCatalogue(), harvestCatalogue()]);

  if (home.status === "rejected") {
    const cached = await hydrateCatalogue();
    if (cached) return cached;
    throw home.reason;
  }

  const harvestResult = harvest.status === "fulfilled" ? harvest.value : { items: [], requests: 0, failures: 1 };
  const snapshot = buildSnapshot({
    sections: home.value.sections,
    harvest: harvestResult.items,
    report: home.value.report,
    rawSections: home.value.rawSections,
    mergedSections: home.value.mergedSections,
    harvestRequests: harvestResult.requests,
    harvestFailures: harvestResult.failures,
  });
  writeCache(CACHE_KEY, snapshot);
  return snapshot;
}

export type SortMode = "default" | "rating" | "year";

export function sortCatalogueItems(items: CatalogueItem[], sort: SortMode): CatalogueItem[] {
  if (sort === "rating") return sortByRating(items);
  if (sort === "year") return sortByYear(items);
  return items;
}

/** Browse a world locally, with optional genre/type/sort filters. */
export function browseCatalogue(
  snapshot: CatalogueSnapshot,
  filters: CatalogueFilters & { sort?: SortMode },
  page = 1,
  pageSize = 30,
): { items: CatalogueItem[]; total: number; hasMore: boolean } {
  const world = snapshot.worlds.find((entry) => entry.key === (filters.world ?? "all"));
  const filtered = applyFilters(world?.items ?? snapshot.index, { ...filters, world: "all" }, snapshot.membership).filter(
    (item) => !filters.genre || matchesGenre(item, filters.genre),
  );
  const base = filters.sort ? sortCatalogueItems(filtered, filters.sort) : filtered;
  const start = (page - 1) * pageSize;
  return {
    items: base.slice(start, start + pageSize),
    total: base.length,
    hasMore: start + pageSize < base.length,
  };
}

/** Title search for the catalogue; filters are applied to the returned page. */
export async function searchTitles(
  query: string,
  page = 1,
  signal?: AbortSignal,
  perPage = 30,
): Promise<SearchPage> {
  return searchCatalogue(query, page, signal, perPage);
}
