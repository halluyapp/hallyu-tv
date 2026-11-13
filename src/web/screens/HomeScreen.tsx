import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CatalogueShelf } from "@/services/catalogue";
import { BROWSE_WORLDS, type WorldKey } from "@/services/catalogue/worlds";
import { resolveStreams } from "@/services/provider/adapter";
import type { LibraryTitle, ProgressRow } from "@/types/library";
import type { CatalogueItem } from "@/types/provider";
import { useCatalogue } from "@/web/hooks/useCatalogue";
import { webDownloadManager } from "@/web/services/downloads";
import { useLibrary } from "@/web/services/library";
import { usePreferences } from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";
import { HeroStage } from "@/web/components/HeroStage";
import { StageRail, type RailEntry } from "@/web/components/StageRail";
import { EmptyState, ErrorState, SkeletonRail } from "@/web/components/States";
import type { PlaybackLaunchParams } from "./DetailsScreen";

const QUICK_WORLDS: WorldKey[] = [
  "trending",
  "kdrama",
  "cdrama",
  "anime",
  "hollywood",
  "bollywood",
  "asian-dramas",
  "movies",
  "series",
  "dubbed",
];

const SHELF_TARGETS: Record<string, { world: WorldKey; genre: string | null }> = {
  "hot-picks": { world: "all", genre: null },
  trending: { world: "trending", genre: null },
  "new-releases": { world: "all", genre: null },
  "top-rated": { world: "all", genre: null },
  "popular-worldwide": { world: "all", genre: null },
  "popular-movies": { world: "movies", genre: null },
  "popular-series": { world: "series", genre: null },
  kdrama: { world: "kdrama", genre: null },
  cdrama: { world: "cdrama", genre: null },
  anime: { world: "anime", genre: null },
  hollywood: { world: "hollywood", genre: null },
};

function shelfTarget(shelf: CatalogueShelf): { world: WorldKey; genre: string | null } {
  if (shelf.key.startsWith("genre-")) return { world: "all", genre: shelf.title };
  const fromSection = shelf.key.replace(/^section-/, "");
  const known = BROWSE_WORLDS.find((w) => w.key === fromSection);
  if (known) return { world: known.key, genre: null };
  return SHELF_TARGETS[shelf.key] ?? { world: "all", genre: null };
}

interface HomeScreenProps {
  onOpenTitle: (detailPath: string, subjectId: string) => void;
  onBrowseWorld: (world: WorldKey, genre: string | null) => void;
  onPlay: (params: PlaybackLaunchParams) => void;
}

export function HomeScreen({ onOpenTitle, onBrowseWorld, onPlay }: HomeScreenProps) {
  const { snapshot, loading, refreshing, error, refresh } = useCatalogue();
  const { progress, watchlist } = useLibrary();
  const { play } = useSound();
  const { prefs } = usePreferences();
  const compact = prefs.cardDensity === "compact";

  const [visibleCount, setVisibleCount] = useState(6);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const heroes = snapshot?.hero ?? [];
  const allShelves = useMemo(() => (snapshot?.shelves ?? []).slice(0, 18), [snapshot?.shelves]);
  const shelves = allShelves.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(6);
  }, [snapshot?.at]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= allShelves.length) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisibleCount(allShelves.length);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(allShelves.length, c + 6));
        }
      },
      { rootMargin: "320px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, allShelves.length]);

  const handleQuickPlayItem = async (item: CatalogueItem) => {
    const se = item.mediaType === "series" ? 1 : 0;
    const ep = item.mediaType === "series" ? 1 : 0;
    const offline = webDownloadManager.getCompletedJob(item.subjectId, se, ep);
    if (offline) {
      onPlay({
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.displayName ?? item.name,
        posterUrl: item.posterUrl,
        mediaType: item.mediaType,
        season: se,
        episode: ep,
        resumeAt: 0,
        sources: [
          {
            url: offline.finalPath,
            resolution: offline.source.resolution ?? "Offline",
            qualityValue: offline.source.qualityValue,
            format: "MP4",
            codec: offline.source.codec,
            sizeBytes: offline.totalBytes,
            durationSeconds: null,
            sourceLabel: "Offline",
            preview: false,
            verifiedFullLength: true,
          },
        ],
        nextEpisode: item.mediaType === "series" ? { season: 1, episode: 2 } : null,
      });
      return;
    }
    try {
      const res = await resolveStreams(item.subjectId, item.slug, se, ep);
      onPlay({
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.displayName ?? item.name,
        posterUrl: item.posterUrl,
        mediaType: item.mediaType,
        season: se,
        episode: ep,
        resumeAt: 0,
        sources: res.sources,
        nextEpisode: item.mediaType === "series" ? { season: 1, episode: 2 } : null,
      });
    } catch {
      onOpenTitle(item.slug, item.subjectId);
    }
  };

  const handleQuickResumeRow = async (row: ProgressRow) => {
    const detailPath = row.detail_path;
    if (!detailPath) return;
    const se = row.media_type === "series" ? row.season_number ?? 1 : 0;
    const ep = row.media_type === "series" ? row.episode_number ?? 1 : 0;
    const offline = webDownloadManager.getCompletedJob(row.subject_id, se, ep);
    if (offline) {
      onPlay({
        subjectId: row.subject_id,
        detailPath,
        title: row.title,
        posterUrl: row.poster_url,
        mediaType: row.media_type,
        season: se,
        episode: ep,
        resumeAt: row.position_seconds,
        sources: [
          {
            url: offline.finalPath,
            resolution: offline.source.resolution ?? "Offline",
            qualityValue: offline.source.qualityValue,
            format: "MP4",
            codec: offline.source.codec,
            sizeBytes: offline.totalBytes,
            durationSeconds: null,
            sourceLabel: "Offline",
            preview: false,
            verifiedFullLength: true,
          },
        ],
        nextEpisode: row.media_type === "series" ? { season: se, episode: ep + 1 } : null,
      });
      return;
    }
    try {
      const res = await resolveStreams(row.subject_id, detailPath, se, ep);
      onPlay({
        subjectId: row.subject_id,
        detailPath,
        title: row.title,
        posterUrl: row.poster_url,
        mediaType: row.media_type,
        season: se,
        episode: ep,
        resumeAt: row.position_seconds,
        sources: res.sources,
        nextEpisode: row.media_type === "series" ? { season: se, episode: ep + 1 } : null,
      });
    } catch {
      onOpenTitle(detailPath, row.subject_id);
    }
  };

  const resumeEntries = useMemo<RailEntry[]>(() => {
    return progress
      .filter((row: ProgressRow) => !row.completed && row.position_seconds > 5)
      .slice(0, 20)
      .map((row) => {
        const pct =
          row.duration_seconds > 0 ? Math.round((row.position_seconds / row.duration_seconds) * 100) : null;
        return {
          key: `${row.subject_id}_${row.season_number ?? 0}_${row.episode_number ?? 0}`,
          posterUrl: row.poster_url,
          title: row.title,
          meta: row.media_type === "series" ? `S${row.season_number ?? 1} · E${row.episode_number ?? 1}` : "Movie",
          progress: pct,
          onPress: () => {
            if (row.detail_path) onOpenTitle(row.detail_path, row.subject_id);
          },
          onPlay: () => void handleQuickResumeRow(row),
        };
      });
  }, [progress, onOpenTitle]);

  const watchlistEntries = useMemo<RailEntry[]>(() => {
    return watchlist.map((item: LibraryTitle) => ({
      key: `lib_${item.subject_id}`,
      posterUrl: item.poster_url,
      title: item.title,
      meta: item.media_type === "series" ? "Series" : "Movie",
      progress: null,
      onPress: () => {
        if (item.detail_path) onOpenTitle(item.detail_path, item.subject_id);
      },
    }));
  }, [watchlist, onOpenTitle]);

  const empty = !loading && !error && snapshot !== null && heroes.length === 0 && allShelves.length === 0;

  if (error && !snapshot) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }

  return (
    <div className="pb-6">
      {!snapshot && loading ? (
        <div className="pt-2">
          <div className="mx-4 sm:mx-6 lg:mx-8 mb-6 h-[340px] rounded-[26px] bg-white/8 border border-white/10 animate-pulse" />
          <SkeletonRail count={6} />
          <SkeletonRail count={6} />
        </div>
      ) : null}

      {empty ? (
        <EmptyState
          title="Nothing here yet"
          message="The catalogue is empty right now. Refresh to check again."
          actionLabel="Refresh"
          onAction={() => void refresh()}
        />
      ) : null}

      {heroes.length > 0 ? (
        <HeroStage
          items={heroes}
          onOpen={(item) => onOpenTitle(item.slug, item.subjectId)}
          onPlay={(item) => void handleQuickPlayItem(item)}
        />
      ) : null}

      {/* Quick Worlds Strip */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 lg:px-8 pb-6">
        {QUICK_WORLDS.map((key) => {
          const label =
            BROWSE_WORLDS.find((w) => w.key === key)?.label ?? (key === "trending" ? "Trending Now" : key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                play("tap");
                onBrowseWorld(key, null);
              }}
              aria-label={`Browse ${label}`}
              className="shrink-0 px-4 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/12 text-xs font-bold text-white transition"
            >
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            play("tap");
            void refresh();
          }}
          disabled={refreshing}
          aria-label="Refresh catalogue"
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#A8B4C4] hover:text-white transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#FF5E3A]" : ""}`} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {resumeEntries.length > 0 ? (
        <StageRail label="Continue Watching" entries={resumeEntries} compact={compact} />
      ) : null}

      {shelves.map((shelf) => (
        <StageRail
          key={shelf.key}
          label={shelf.subtitle ? `${shelf.title} · ${shelf.subtitle}` : shelf.title}
          compact={compact}
          onSeeAll={() => {
            const target = shelfTarget(shelf);
            onBrowseWorld(target.world, target.genre);
          }}
          entries={shelf.items.map((item) => ({
            key: `${shelf.key}_${item.subjectId}`,
            posterUrl: item.posterUrl,
            title: item.displayName ?? item.name,
            meta: [item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · "),
            progress: null,
            onPress: () => onOpenTitle(item.slug, item.subjectId),
          }))}
        />
      ))}

      {visibleCount < allShelves.length ? <div ref={sentinelRef} className="h-12" /> : null}

      {watchlistEntries.length > 0 ? (
        <StageRail label="Saved to Watchlist" entries={watchlistEntries} compact={compact} />
      ) : null}
    </div>
  );
}
