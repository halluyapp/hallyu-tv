import { useCatalogue } from "@/hooks/useCatalogue";
import { searchTitles } from "@/services/catalogue";
import type { CatalogueSnapshot } from "@/services/catalogue";
import {
  matchesGenre,
  matchesWorld,
  sortByRating,
  uniqueItems,
  type WorldKey,
} from "@/services/catalogue/worlds";
import { ProviderError, type CatalogueItem } from "@/types/provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Catalogue browsing state shared by mobile Explore and TV Explore.
 *
 * Two modes, never mixed:
 *   • browse  — client-side filtering of the catalogue index by world/genre/type
 *   • search  — the provider's real title search, debounced, aborted on change,
 *               latest-request-wins, paginated, de-duplicated
 *
 * A world/genre chip never becomes a search term. Filters are applied to either
 * list after it arrives, so "K-Drama + Romance" always means metadata.
 */

const PAGE_SIZE = 30;
const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

export type ContentType = "all" | "movie" | "series";

export interface BrowserFilters {
  world: WorldKey;
  genre: string | null;
  type: ContentType;
}

export interface CatalogueBrowser {
  snapshot: CatalogueSnapshot | null;
  filters: BrowserFilters;
  query: string;
  setQuery: (value: string) => void;
  setWorld: (world: WorldKey) => void;
  setGenre: (genre: string | null) => void;
  setType: (type: ContentType) => void;
  reset: () => void;
  filtersActive: boolean;
  searchMode: boolean;
  items: CatalogueItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => Promise<void>;
  refreshing: boolean;
}

export function useCatalogueBrowser(initial: Partial<BrowserFilters> = {}): CatalogueBrowser {
  const { snapshot, loading: catalogueLoading, error: catalogueError, refreshing, refresh } = useCatalogue();

  const [world, setWorldState] = useState<WorldKey>(initial.world ?? "all");
  const [genre, setGenreState] = useState<string | null>(initial.genre ?? null);
  const [type, setTypeState] = useState<ContentType>(initial.type ?? "all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [searchItems, setSearchItems] = useState<CatalogueItem[] | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const trimmed = query.trim();
  const searchMode = trimmed.length >= MIN_QUERY;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [world, genre, type, trimmed]);

  useEffect(() => {
    if (!searchMode) {
      seq.current += 1;
      controller.current?.abort();
      controller.current = null;
      setSearchItems(null);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearching(false);
      return;
    }

    const id = ++seq.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      void searchTitles(trimmed, 1, request.signal, PAGE_SIZE)
        .then((page) => {
          if (seq.current !== id) return;
          setSearchItems(page.items);
          setSearchPage(1);
          setSearchHasMore(page.hasMore);
        })
        .catch((err) => {
          if (seq.current !== id || request.signal.aborted) return;
          setSearchItems([]);
          setSearchHasMore(false);
          setSearchError(err instanceof ProviderError ? err.message : "Search failed. Check your connection.");
        })
        .finally(() => {
          if (seq.current === id) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, searchMode]);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const membership = snapshot?.membership;

  const keep = useCallback(
    (item: CatalogueItem): boolean => {
      if (!matchesWorld(item, world, membership)) return false;
      if (!matchesGenre(item, genre)) return false;
      if (type !== "all" && item.mediaType !== type) return false;
      return true;
    },
    [world, genre, type, membership],
  );

  const browseAll = useMemo(() => {
    const index = snapshot?.index ?? [];
    return sortByRating(index.filter(keep));
  }, [snapshot, keep]);

  const filteredSearch = useMemo(() => (searchItems ?? []).filter(keep), [searchItems, keep]);

  const source = searchMode ? filteredSearch : browseAll;
  const items = source.slice(0, visibleCount);
  const total = searchMode ? filteredSearch.length : browseAll.length;
  const canPageServer = searchMode && searchHasMore && !searching && !loadingMore;

  const loadMore = useCallback(() => {
    if (visibleCount < source.length) {
      setVisibleCount((count) => count + PAGE_SIZE);
      return;
    }
    if (!searchMode || !canPageServer) return;

    const id = seq.current;
    setLoadingMore(true);
    const nextPage = searchPage + 1;
    void searchTitles(trimmed, nextPage, controller.current?.signal, PAGE_SIZE)
      .then((page) => {
        if (seq.current !== id) return;
        setSearchItems((current) => uniqueItems([...(current ?? []), ...page.items]));
        setSearchPage(nextPage);
        setSearchHasMore(page.hasMore);
        setVisibleCount((count) => count + PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => {
        if (seq.current === id) setLoadingMore(false);
      });
  }, [visibleCount, source.length, searchMode, canPageServer, searchPage, trimmed]);

  const reset = useCallback(() => {
    setWorldState("all");
    setGenreState(null);
    setTypeState("all");
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }, []);

  return {
    snapshot,
    filters: { world, genre, type },
    query,
    setQuery,
    setWorld: setWorldState,
    setGenre: setGenreState,
    setType: setTypeState,
    reset,
    filtersActive: world !== "all" || genre !== null || type !== "all" || trimmed.length > 0,
    searchMode,
    items,
    total,
    hasMore: searchMode ? visibleCount < filteredSearch.length || searchHasMore : visibleCount < browseAll.length,
    loading: catalogueLoading && !snapshot,
    searching,
    loadingMore,
    error: catalogueError ?? searchError,
    loadMore,
    refresh,
    refreshing,
  };
}
