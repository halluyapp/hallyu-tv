import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { SortMode } from "@/services/catalogue";
import { BROWSE_WORLDS, type WorldKey } from "@/services/catalogue/worlds";
import { useCatalogueBrowser, type ContentType } from "@/web/hooks/useCatalogue";
import { usePreferences } from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";
import { Poster, initialsFor } from "@/web/components/Poster";
import { EmptyState, ErrorState, SkeletonRail } from "@/web/components/States";

const WORLD_CHIPS = BROWSE_WORLDS.filter((w) => w.key !== "shorts");

const TYPES: { key: ContentType; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "Series" },
];

const SORTS: { key: SortMode; label: string }[] = [
  { key: "default", label: "Featured" },
  { key: "rating", label: "Top Rated" },
  { key: "year", label: "Newest" },
];

interface DiscoverScreenProps {
  initialWorld?: WorldKey;
  initialGenre?: string | null;
  initialQuery?: string;
  focusSearchTrigger?: number;
  onOpenTitle: (detailPath: string, subjectId: string) => void;
}

export function DiscoverScreen({
  initialWorld,
  initialGenre,
  initialQuery,
  focusSearchTrigger,
  onOpenTitle,
}: DiscoverScreenProps) {
  const browser = useCatalogueBrowser({ world: initialWorld, genre: initialGenre, query: initialQuery });
  const { setWorld, setGenre, setSort } = browser;
  const { play } = useSound();
  const { prefs } = usePreferences();
  const compact = prefs.cardDensity === "compact";
  const inputRef = useRef<HTMLInputElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (initialWorld) setWorld(initialWorld);
    if (initialGenre !== undefined) setGenre(initialGenre);
  }, [initialWorld, initialGenre, setWorld, setGenre]);

  useEffect(() => {
    if (focusSearchTrigger && focusSearchTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [focusSearchTrigger]);

  const genres = browser.snapshot?.genres ?? [];
  const empty = !browser.loading && !browser.searching && browser.items.length === 0;
  const activeSubFilterCount =
    (browser.filters.world !== "all" ? 1 : 0) +
    (browser.filters.genre !== null ? 1 : 0) +
    (browser.filters.type !== "all" ? 1 : 0);

  if (browser.error && !browser.snapshot) {
    return <ErrorState message={browser.error} onRetry={() => void browser.refresh()} />;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-10">
      {/* Search Bar */}
      <div className="mb-3">
        <div className="relative flex items-center glass-panel-bright rounded-full px-4 h-12 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
          <Search className="w-4 h-4 text-[#A8B4C4] mr-3 shrink-0" />
          <label htmlFor="explore-search-input" className="sr-only">
            Search titles
          </label>
          <input
            id="explore-search-input"
            ref={inputRef}
            type="search"
            value={browser.query}
            onChange={(e) => browser.setQuery(e.target.value)}
            placeholder="Search films, series, genres…"
            className="w-full bg-transparent text-sm sm:text-[15px] font-medium text-white placeholder-[#6B7787] focus:outline-none"
          />
          {browser.query.length > 0 ? (
            <button
              type="button"
              onClick={() => browser.setQuery("")}
              aria-label="Clear search"
              className="p-1.5 text-[#A8B4C4] hover:text-white rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Compact Control Bar: Mobile Filter Drawer Toggle + Sort + Count */}
      <div className="flex flex-wrap items-center gap-2 py-2 mb-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className={`md:hidden inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
            filtersOpen || activeSubFilterCount > 0
              ? "bg-[#FF5E3A]/15 border-[#FF8256] text-[#FF8256]"
              : "bg-white/10 border-white/12 text-white"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Filters{activeSubFilterCount > 0 ? ` (${activeSubFilterCount})` : ""}</span>
        </button>

        {/* Sort Pills */}
        <div className="inline-flex items-center gap-1 bg-white/6 border border-white/10 rounded-full p-0.5">
          <ArrowUpDown className="w-3 h-3 text-[#6B7787] ml-2 mr-0.5 hidden sm:inline" />
          {SORTS.map((s) => {
            const active = browser.filters.sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                  active ? "bg-[#FF5E3A] text-white" : "text-[#A8B4C4] hover:text-white"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-xs font-medium text-[#6B7787]">
          {browser.loading || browser.searching ? "Loading…" : `${browser.total} titles`}
        </span>

        {browser.filtersActive ? (
          <button
            type="button"
            onClick={browser.reset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-[#FF5E3A] hover:bg-[#FF5E3A]/10 transition"
          >
            <X className="w-3.5 h-3.5" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Filter Shelves: always visible on md+, collapsible on mobile */}
      <div className={`${filtersOpen ? "block" : "hidden md:block"} pb-4`}>
        {/* World Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5">
          {WORLD_CHIPS.map((world) => {
            const active = browser.filters.world === world.key;
            return (
              <button
                key={world.key}
                type="button"
                onClick={() => {
                  play("tap");
                  setWorld(world.key);
                }}
                aria-pressed={active}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? "ember-gradient border-[#FF8256] text-white font-bold shadow-[0_4px_16px_rgba(255,94,58,0.3)]"
                    : "bg-white/10 border-white/10 text-[#A8B4C4] hover:text-white hover:bg-white/15"
                }`}
              >
                {world.label}
              </button>
            );
          })}
        </div>

        {/* Genre Chips */}
        {genres.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5">
            <button
              type="button"
              onClick={() => setGenre(null)}
              aria-pressed={browser.filters.genre === null}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                browser.filters.genre === null
                  ? "bg-[#FF8256] border-[#FF8256] text-[#1A0E0A] font-bold"
                  : "border-white/12 text-[#6B7787] hover:text-white"
              }`}
            >
              All genres
            </button>
            {genres.map((genre) => {
              const active = browser.filters.genre === genre;
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setGenre(active ? null : genre)}
                  aria-pressed={active}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    active
                      ? "bg-[#FF8256] border-[#FF8256] text-[#1A0E0A] font-bold"
                      : "border-white/12 text-[#6B7787] hover:text-white"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Type Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          {TYPES.map((entry) => {
            const active = browser.filters.type === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => browser.setType(entry.key)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  active ? "bg-[#FF5E3A] text-white" : "bg-white/10 text-[#A8B4C4] hover:text-white"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Grid */}
      {browser.loading || browser.searching ? (
        <SkeletonRail count={6} />
      ) : empty ? (
        <EmptyState
          title={browser.searchMode ? "No titles found" : "Nothing here yet"}
          message={
            browser.searchMode
              ? `Nothing matched “${browser.query.trim()}” with these filters. Try clearing them.`
              : "This collection is empty right now. Another world is a tap away."
          }
          actionLabel={browser.filtersActive ? "Reset filters" : undefined}
          onAction={browser.filtersActive ? browser.reset : undefined}
        />
      ) : (
        <>
          <div
            className={`grid gap-3.5 sm:gap-4 ${
              compact
                ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            }`}
          >
            {browser.items.map((item) => {
              const title = item.displayName ?? item.name;
              const meta = [item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ");
              return (
                <button
                  key={item.subjectId}
                  type="button"
                  onClick={() => {
                    play("tap");
                    onOpenTitle(item.slug, item.subjectId);
                  }}
                  aria-label={`${title}${meta ? `, ${meta}` : ""}`}
                  className="group text-left transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E141E] border border-white/12 group-hover:border-[#FF8256]/70 group-hover:shadow-[0_12px_30px_rgba(255,94,58,0.2)] transition-all">
                    <Poster
                      uri={item.posterUrl}
                      alt={title}
                      initials={initialsFor(title)}
                      width={compact ? 240 : 300}
                      className="w-full h-full"
                    />
                    {item.rating ? (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/75 border border-white/15 text-amber-400">
                        ★ {item.rating}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-white truncate group-hover:text-[#FF8256] transition-colors">
                    {title}
                  </p>
                  {meta ? <p className="text-[11px] font-medium text-[#6B7787] truncate">{meta}</p> : null}
                </button>
              );
            })}
          </div>

          {browser.hasMore ? (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={() => void browser.loadMore()}
                disabled={browser.loadingMore}
                className="px-6 py-2.5 rounded-full glass-panel-bright text-sm font-bold text-white hover:border-[#FF8256] transition disabled:opacity-50"
              >
                {browser.loadingMore ? "Loading more…" : "Load more titles"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
