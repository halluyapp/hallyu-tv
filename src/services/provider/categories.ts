import { cacheState, hydrateCache, readCache, writeCache } from "@/services/cache/swr";
import type { CatalogueItem, HomeSection } from "@/types/provider";
import { searchCatalogue } from "./adapter";
import { hydrateHome, loadHome, peekHome } from "./homeCatalogue";

export type WorldId =
  | "all"
  | "discover"
  | "kdrama"
  | "cdrama"
  | "anime"
  | "movies"
  | "series"
  | "hollywood"
  | "thriller"
  | "romance"
  | "action"
  | "historical";

export type SubFilterId = "all" | "top_rated" | "series" | "movies" | "thriller" | "romance" | "historical" | "recent";

export interface WorldDefinition {
  id: WorldId;
  label: string;
  subtitle: string;
  /** Primary Zarhosting search query used for multi-page catalogue browsing. */
  searchQuery: string;
  /** Optional home section title matcher to seed instant page-1 richness. */
  sectionMatcher?: RegExp;
  mediaType?: "movie" | "series";
}

export const WORLD_DEFINITIONS: Record<WorldId, WorldDefinition> = {
  all: {
    id: "all",
    label: "All",
    subtitle: "Trending cinema, Asian dramas & global hits",
    searchQuery: "korea",
  },
  discover: {
    id: "discover",
    label: "Discover",
    subtitle: "Curated premieres, dramas, anime & global cinema",
    searchQuery: "drama",
  },
  kdrama: {
    id: "kdrama",
    label: "K-Drama",
    subtitle: "Korean television dramas, thrillers & romances",
    searchQuery: "korean",
    sectionMatcher: /k-?drama|korea/i,
  },
  cdrama: {
    id: "cdrama",
    label: "C-Drama",
    subtitle: "Chinese wuxia, historical epics & modern series",
    searchQuery: "chinese",
    sectionMatcher: /c-?drama|china|chinese/i,
  },
  anime: {
    id: "anime",
    label: "Anime",
    subtitle: "Japanese animation series & feature films",
    searchQuery: "anime",
    sectionMatcher: /anime|animation/i,
  },
  movies: {
    id: "movies",
    label: "Movies",
    subtitle: "Full-length feature films in crisp HD",
    searchQuery: "movie",
    sectionMatcher: /movie|film|cinema/i,
    mediaType: "movie",
  },
  series: {
    id: "series",
    label: "Series",
    subtitle: "Multi-episode dramas, mysteries & limited series",
    searchQuery: "season",
    sectionMatcher: /series|drama|show|tv/i,
    mediaType: "series",
  },
  hollywood: {
    id: "hollywood",
    label: "Hollywood",
    subtitle: "Blockbuster cinema & international acclaim",
    searchQuery: "action",
    sectionMatcher: /hollywood|western|popular|trending|top/i,
  },
  thriller: {
    id: "thriller",
    label: "Thriller",
    subtitle: "Noir mysteries, crime investigations & suspense",
    searchQuery: "thriller",
  },
  romance: {
    id: "romance",
    label: "Romance",
    subtitle: "Heartfelt stories, fate & unforgettable chemistry",
    searchQuery: "romance",
  },
  action: {
    id: "action",
    label: "Action",
    subtitle: "High-stakes action, martial arts & survival",
    searchQuery: "action",
  },
  historical: {
    id: "historical",
    label: "Historical",
    subtitle: "Dynasty sagas, period dramas & palace intrigue",
    searchQuery: "historical",
  },
};

export interface SubFilterOption {
  id: SubFilterId;
  label: string;
}

export const TV_CATEGORY_FILTERS: SubFilterOption[] = [
  { id: "all", label: "All" },
  { id: "top_rated", label: "Top Rated" },
  { id: "thriller", label: "Thriller" },
  { id: "romance", label: "Romance" },
  { id: "historical", label: "Historical" },
  { id: "recent", label: "Recent" },
];

export const MOBILE_EXPLORE_WORLDS: WorldId[] = [
  "all",
  "kdrama",
  "cdrama",
  "anime",
  "series",
  "movies",
  "thriller",
  "romance",
  "action",
  "historical",
];

function dedupeItems(items: CatalogueItem[]): CatalogueItem[] {
  const seen = new Set<string>();
  const out: CatalogueItem[] = [];
  for (const item of items) {
    if (!item?.subjectId || seen.has(item.subjectId)) continue;
    seen.add(item.subjectId);
    out.push(item);
  }
  return out;
}

function flattenHomeSections(sections: HomeSection[], matcher?: RegExp, mediaType?: "movie" | "series"): CatalogueItem[] {
  const matched: CatalogueItem[] = [];
  const fallback: CatalogueItem[] = [];
  for (const s of sections) {
    if (matcher && matcher.test(s.section)) {
      matched.push(...s.items);
    } else {
      fallback.push(...s.items);
    }
  }
  const source = matched.length >= 6 ? matched : matcher ? [...matched, ...fallback] : [...matched, ...fallback];
  const deduped = dedupeItems(source);
  if (!mediaType) return deduped;
  return deduped.filter((item) => item.mediaType === mediaType);
}

export function applyClientSubFilter(items: CatalogueItem[], filter: SubFilterId): CatalogueItem[] {
  if (filter === "all") return items;
  if (filter === "series") return items.filter((i) => i.mediaType === "series");
  if (filter === "movies") return items.filter((i) => i.mediaType === "movie");
  if (filter === "top_rated") {
    return [...items].sort((a, b) => ( parseFloat(b.rating ?? "0") || 0 ) - ( parseFloat(a.rating ?? "0") || 0 ));
  }
  if (filter === "recent") {
    return [...items].sort((a, b) => (parseInt(b.year ?? "0", 10) || 0) - (parseInt(a.year ?? "0", 10) || 0));
  }
  return items;
}

function effectiveQueryFor(world: WorldDefinition, subFilter: SubFilterId): string {
  if (subFilter === "thriller") return world.id === "all" || world.id === "discover" ? "thriller" : `${world.searchQuery} thriller`;
  if (subFilter === "romance") return world.id === "all" || world.id === "discover" ? "romance" : `${world.searchQuery} romance`;
  if (subFilter === "historical") return world.id === "all" || world.id === "discover" ? "historical" : `${world.searchQuery} historical`;
  return world.searchQuery;
}

export interface WorldPageResult {
  items: CatalogueItem[];
  page: number;
  totalPages: number;
}

const WORLD_FRESH_TTL_MS = 3 * 60 * 1000;

export function peekWorldFirstPage(worldId: WorldId): CatalogueItem[] | null {
  const mem = readCache<CatalogueItem[]>(`hallyu.world.v2.${worldId}`);
  if (mem && Array.isArray(mem.value) && mem.value.length > 0) {
    return mem.value;
  }
  const home = peekHome();
  if (!home) return null;
  const def = WORLD_DEFINITIONS[worldId];
  const seeded = flattenHomeSections(home, def.sectionMatcher, def.mediaType);
  return seeded.length > 0 ? seeded : null;
}

export async function hydrateWorldFirstPage(worldId: WorldId): Promise<CatalogueItem[] | null> {
  const sync = peekWorldFirstPage(worldId);
  if (sync) return sync;
  const cached = await hydrateCache<CatalogueItem[]>(`hallyu.world.v2.${worldId}`);
  if (cached && Array.isArray(cached.value) && cached.value.length > 0) {
    return cached.value;
  }
  const home = await hydrateHome();
  if (!home) return null;
  const def = WORLD_DEFINITIONS[worldId];
  const seeded = flattenHomeSections(home, def.sectionMatcher, def.mediaType);
  return seeded.length > 0 ? seeded : null;
}

export async function loadWorldPage(
  worldId: WorldId,
  page = 1,
  subFilter: SubFilterId = "all",
  signal?: AbortSignal,
): Promise<WorldPageResult> {
  if (page === 1 && subFilter === "all") {
    const existing = readCache<CatalogueItem[]>(`hallyu.world.v2.${worldId}`);
    if (
      existing &&
      Array.isArray(existing.value) &&
      existing.value.length > 0 &&
      cacheState(existing, Date.now(), WORLD_FRESH_TTL_MS) === "fresh"
    ) {
      return { items: existing.value, page: 1, totalPages: 3 };
    }
  }

  const def = WORLD_DEFINITIONS[worldId];
  const query = effectiveQueryFor(def, subFilter);

  if (page === 1 && (worldId === "all" || worldId === "discover") && subFilter === "all") {
    const [sections, searchRes] = await Promise.all([
      (peekHome() ? Promise.resolve(peekHome()!) : hydrateHome().then((c) => c ?? loadHome().catch(() => [] as HomeSection[]))),
      searchCatalogue(query, 1, signal).catch(() => ({ items: [] as CatalogueItem[], page: 1, totalPages: 1 })),
    ]);
    const combined = dedupeItems([...flattenHomeSections(sections), ...searchRes.items]);
    if (combined.length > 0) writeCache(`hallyu.world.v2.${worldId}`, combined);
    return {
      items: combined,
      page: 1,
      totalPages: Math.max(searchRes.totalPages, 2),
    };
  }

  const [homeSections, searchRes] = await Promise.all([
    page === 1 && subFilter === "all"
      ? (peekHome() ? Promise.resolve(peekHome()!) : hydrateHome().then((c) => c ?? loadHome().catch(() => [])))
      : Promise.resolve([] as HomeSection[]),
    searchCatalogue(query, page, signal),
  ]);

  let items = searchRes.items;
  if (page === 1 && subFilter === "all" && def.sectionMatcher && homeSections.length > 0) {
    const matchedFromHome = homeSections
      .filter((s) => def.sectionMatcher!.test(s.section))
      .flatMap((s) => s.items);
    items = dedupeItems([...matchedFromHome, ...items]);
  }
  if (def.mediaType) {
    items = items.filter((item) => item.mediaType === def.mediaType);
  }
  items = applyClientSubFilter(items, subFilter);

  if (page === 1 && subFilter === "all" && items.length > 0) {
    writeCache(`hallyu.world.v2.${worldId}`, items);
  }

  return {
    items,
    page: searchRes.page,
    totalPages: searchRes.totalPages,
  };
}
