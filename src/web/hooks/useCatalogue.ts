import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  browseCatalogue,
  searchTitles,
  sortCatalogueItems,
  type CatalogueSnapshot,
  type SortMode,
} from "@/services/catalogue";
import { isBlockedItem, matchesWorld, uniqueItems, type WorldKey, type WorldMembership } from "@/services/catalogue/worlds";
import { ProviderError, type CatalogueItem } from "@/types/provider";
import { useSharedCatalogue } from "@/web/state/catalogueContext";

export function useCatalogue() {
  return useSharedCatalogue();
}

export type ContentType = "all" | "movie" | "series";

export interface BrowserFilters {
  world: WorldKey;
  genre: string | null;
  type: ContentType;
  sort: SortMode;
}

const DEFAULT_FILTERS: BrowserFilters = {
  world: "all",
  genre: null,
  type: "all",
  sort: "default",
};

/** Pure filter + world + sort helper for live search results, unit-tested cleanly. */
export function filterAndSortSearchItems(
  items: CatalogueItem[],
  filters: BrowserFilters,
  membership?: WorldMembership,
): CatalogueItem[] {
  const filtered = uniqueItems(items).filter((item) => {
    if (isBlockedItem(item)) return false;
    if (filters.world !== "all" && !matchesWorld(item, filters.world, membership)) return false;
    if (filters.type !== "all" && item.mediaType !== filters.type) return false;
    if (filters.genre) {
      const g = (item.genre ?? "").toLowerCase();
      if (!g.includes(filters.genre.toLowerCase())) return false;
    }
    return true;
  });
  return sortCatalogueItems(filtered, filters.sort);
}

export function useCatalogueBrowser(initial?: { world?: WorldKey; genre?: string | null; query?: string }) {
  const { snapshot, loading, error, refresh } = useCatalogue();
  const [query, setQuery] = useState(initial?.query ?? "");
  const [filters, setFilters] = useState<BrowserFilters>({
    ...DEFAULT_FILTERS,
    world: initial?.world ?? "all",
    genre: initial?.genre ?? null,
  });
  const [page, setPage] = useState(1);

  const [searchItems, setSearchItems] = useState<CatalogueItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const searchMode = trimmedQuery.length > 0;

  useEffect(() => {
    setPage(1);
  }, [filters.world, filters.genre, filters.type, filters.sort]);

  useEffect(() => {
    abortRef.current?.abort();
    if (!searchMode) {
      setSearchItems([]);
      setSearchHasMore(false);
      setSearchTotal(0);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      void searchTitles(trimmedQuery, 1, controller.signal, 30)
        .then((res) => {
          if (controller.signal.aborted) return;
          setSearchItems(res.items);
          setSearchPage(1);
          setSearchHasMore(res.hasMore);
          setSearchTotal(res.total);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setSearchError(err instanceof ProviderError ? err.message : "Search failed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, searchMode]);

  const browseResult = useMemo(() => {
    if (!snapshot) return { items: [] as CatalogueItem[], total: 0, hasMore: false };
    return browseCatalogue(snapshot as CatalogueSnapshot, filters, 1, page * 30);
  }, [snapshot, filters, page]);

  const filteredSearchItems = useMemo(() => {
    if (!searchMode) return [];
    return filterAndSortSearchItems(searchItems, filters, snapshot?.membership);
  }, [searchMode, searchItems, filters, snapshot?.membership]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    if (searchMode) {
      if (!searchHasMore) return;
      setLoadingMore(true);
      try {
        const nextPage = searchPage + 1;
        const res = await searchTitles(trimmedQuery, nextPage, undefined, 30);
        setSearchItems((prev) => uniqueItems([...prev, ...res.items]));
        setSearchPage(nextPage);
        setSearchHasMore(res.hasMore);
      } finally {
        setLoadingMore(false);
      }
      return;
    }

    if (browseResult.hasMore) {
      setPage((p) => p + 1);
    }
  }, [loadingMore, searchMode, searchHasMore, searchPage, trimmedQuery, browseResult.hasMore]);

  const setWorld = useCallback((world: WorldKey) => setFilters((f) => ({ ...f, world })), []);
  const setGenre = useCallback((genre: string | null) => setFilters((f) => ({ ...f, genre })), []);
  const setType = useCallback((type: ContentType) => setFilters((f) => ({ ...f, type })), []);
  const setSort = useCallback((sort: SortMode) => setFilters((f) => ({ ...f, sort })), []);
  const reset = useCallback(() => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filtersActive =
    trimmedQuery.length > 0 ||
    filters.world !== "all" ||
    filters.genre !== null ||
    filters.type !== "all" ||
    filters.sort !== "default";

  const hasSubFiltersInSearch = filters.world !== "all" || filters.genre !== null || filters.type !== "all";

  return {
    snapshot,
    loading,
    searching,
    loadingMore,
    error: searchError ?? error,
    refresh,
    query,
    setQuery,
    filters,
    setWorld,
    setGenre,
    setType,
    setSort,
    reset,
    filtersActive,
    searchMode,
    items: searchMode ? filteredSearchItems : browseResult.items,
    total: searchMode
      ? hasSubFiltersInSearch
        ? filteredSearchItems.length
        : Math.max(filteredSearchItems.length, searchTotal)
      : browseResult.total,
    hasMore: searchMode ? searchHasMore : browseResult.hasMore,
    loadMore,
  };
}
