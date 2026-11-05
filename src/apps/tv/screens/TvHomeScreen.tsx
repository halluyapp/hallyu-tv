import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Play, Plus, Star } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { palette, radius, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { COMPLETION_THRESHOLD, useLibrary, type ProgressRow } from "@/state/LibraryContext";
import type { CatalogueItem, HomeSection, TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";

type Nav = NativeStackNavigationProp<TvStackParamList>;

const LEFT_CONTENT_INSET = COLLAPSED_RAIL_WIDTH + 44;

/**
 * 1:1 Hallyu TV Home Screen (`docs/ui-previews/tv-01-home.png`):
 * - Full-bleed widescreen cinema hero + cached AmbientArtworkCanvas
 * - Frosted Liquid Glass metadata pills ('K-Drama Series', gold star rating, year, 'HD')
 * - Luminous pearl-to-coral 'Play' / 'Resume' capsule + frosted crystal '+ My List' capsule
 * - 16:9 Frosted Liquid Glass 'Continue Watching' rail with glowing progress bars
 * - Virtualized 2:3 cinema poster rails with 10-foot Liquid Glass focus halos
 */
export function TvHomeScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { progress, inWatchlist, toggleWatchlist, latestFor } = useLibrary();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroDetail, setHeroDetail] = useState<TitleDetail | null>(null);
  const [heroFocused, setHeroFocused] = useState(false);
  const [openingPlay, setOpeningPlay] = useState(false);

  const refreshCatalogue = useCallback(async () => {
    setError(null);
    const cached = await hydrateHome();
    if (cached && cached.length > 0) {
      setSections(cached);
      setLoading(false);
    }
    try {
      const fresh = await loadHome();
      if (fresh.length > 0) {
        setSections(fresh);
      } else if (!cached) {
        setError("No catalogue sections returned right now.");
      }
    } catch {
      if (!cached || cached.length === 0) {
        setError("Could not reach the Hallyu streaming catalogue. Check your network and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalogue();
  }, [refreshCatalogue]);

  const heroCandidates = useMemo(() => {
    const firstItems = sections[0]?.items ?? [];
    return firstItems.slice(0, 6);
  }, [sections]);

  const activeHeroItem = heroCandidates[heroIndex] ?? null;

  // Gentle billboard rotation ONLY when screen is focused, hero buttons aren't focused, and RAM allows
  useEffect(() => {
    if (!isFocused || heroFocused || heroCandidates.length <= 1 || profile.isLowRam) return;
    const timer = setInterval(() => {
      setHeroIndex((idx) => (idx + 1) % heroCandidates.length);
    }, 11_000);
    return () => clearInterval(timer);
  }, [heroCandidates.length, heroFocused, isFocused, profile.isLowRam]);

  // Fetch rich synopsis + backdrop for the featured hero
  useEffect(() => {
    if (!activeHeroItem?.slug) {
      setHeroDetail(null);
      return;
    }
    const controller = new AbortController();
    fetchDetail(activeHeroItem.slug, controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setHeroDetail(d);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHeroDetail(null);
      });
    return () => controller.abort();
  }, [activeHeroItem?.slug]);

  const continueWatching = useMemo(
    () =>
      progress
        .filter((row) => !row.completed && row.position_seconds > 5)
        .slice(0, 14),
    [progress],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      navigation.navigate("TvDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation],
  );

  const handlePlayHero = useCallback(async () => {
    if (!activeHeroItem || openingPlay) return;
    setOpeningPlay(true);
    try {
      const resume = latestFor(activeHeroItem.subjectId);
      const isSeries = (heroDetail?.mediaType ?? activeHeroItem.mediaType) === "series";
      const season = isSeries ? (resume?.season_number ?? heroDetail?.seasons[0]?.season ?? 1) : 0;
      const episode = isSeries ? (resume?.episode_number ?? 1) : 0;
      const maxEp = heroDetail?.seasons.find((s) => s.season === season)?.maxEp ?? 0;
      const res = await resolveStreams(activeHeroItem.subjectId, activeHeroItem.slug, season, episode);
      navigation.navigate("TvPlayer", {
        subjectId: activeHeroItem.subjectId,
        detailPath: activeHeroItem.slug,
        title: activeHeroItem.name,
        posterUrl: activeHeroItem.posterUrl,
        mediaType: isSeries ? "series" : "movie",
        season,
        episode,
        maxEpisodesInSeason: maxEp,
        resumeAt: resume && !resume.completed ? resume.position_seconds : 0,
        sources: res.sources,
        nextEpisode: isSeries && (maxEp === 0 || episode < maxEp) ? { season, episode: episode + 1 } : null,
      });
    } catch {
      openDetails(activeHeroItem);
    } finally {
      setOpeningPlay(false);
    }
  }, [activeHeroItem, heroDetail, latestFor, navigation, openDetails, openingPlay]);

  const handleResumeCard = useCallback(
    async (row: ProgressRow) => {
      if (!row.detail_path) return;
      const isSeries = row.media_type === "series";
      const se = isSeries ? (row.season_number ?? 1) : 0;
      const ep = isSeries ? (row.episode_number ?? 1) : 0;
      navigation.navigate("TvPlayer", {
        subjectId: row.subject_id,
        detailPath: row.detail_path,
        title: row.title,
        posterUrl: row.poster_url,
        mediaType: row.media_type,
        season: se,
        episode: ep,
        resumeAt: row.position_seconds,
        sources: [],
        nextEpisode: isSeries ? { season: se, episode: ep + 1 } : null,
      });
    },
    [navigation],
  );

  const heroArt = heroDetail?.backdropUrl ?? activeHeroItem?.posterUrl ?? null;
  const heroSaved = activeHeroItem ? inWatchlist(activeHeroItem.subjectId) : false;
  const heroResume = activeHeroItem ? latestFor(activeHeroItem.subjectId) : null;
  const heroCtaLabel = openingPlay
    ? "Opening Stream…"
    : heroResume && !heroResume.completed
      ? heroResume.media_type === "series"
        ? `Resume S${heroResume.season_number ?? 1} · E${heroResume.episode_number ?? 1}`
        : "Resume Movie"
      : activeHeroItem?.mediaType === "series"
        ? "Play S1 · E1"
        : "Watch Now";

  const heroRating = useMemo(() => {
    const raw = heroDetail?.rating ?? activeHeroItem?.rating;
    const n = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  }, [activeHeroItem?.rating, heroDetail?.rating]);

  const posterWidth = Math.max(142, Math.min(186, Math.round((stage.width - LEFT_CONTENT_INSET - 40) / 5.7)));
  const landscapeWidth = Math.max(240, Math.min(300, Math.round((stage.width - LEFT_CONTENT_INSET - 40) / 3.6)));

  if (loading && sections.length === 0) {
    return (
      <View style={styles.centerState}>
        <AmbientArtworkCanvas intensity="subtle" />
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.stateLabel}>Opening Hallyu TV Cinema…</Text>
      </View>
    );
  }

  if (error && sections.length === 0) {
    return (
      <View style={styles.centerState}>
        <AmbientArtworkCanvas intensity="subtle" />
        <Text style={styles.errorTitle}>Catalogue Unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <GlassPillButton label="Retry Connection" variant="primary" size="tv" hasTVPreferredFocus onPress={refreshCatalogue} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={heroArt} intensity="rich" />

      {/* Top-right full-bleed hero artwork melting into the Liquid Glass canvas */}
      {heroArt ? (
        <View style={[styles.heroBackdropWrap, { height: Math.max(330, Math.round(stage.height * 0.68)) }]} pointerEvents="none">
          <ExpoImage
            source={{ uri: heroArt }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={profile.imageTransitionMs}
          />
          <LinearGradient
            colors={["#05080E", "rgba(5, 8, 14, 0.78)", "rgba(5, 8, 14, 0.16)"]}
            locations={[0, 0.44, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["rgba(5, 8, 14, 0.12)", "rgba(5, 8, 14, 0.62)", "#05080E"]}
            locations={[0, 0.68, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingLeft: LEFT_CONTENT_INSET }]}
      >
        <Text style={styles.brandWordmark}>Hallyu TV</Text>

        {/* Featured Hero Stage */}
        {activeHeroItem ? (
          <View style={styles.heroStage}>
            <View style={styles.metaRow}>
              <View style={styles.glassMetaChip}>
                <Text style={styles.glassMetaText}>
                  {activeHeroItem.mediaType === "series" ? "K-Drama & Series" : "Feature Film"}
                </Text>
              </View>
              {heroRating ? (
                <View style={styles.glassMetaChip}>
                  <Star size={12} color={palette.gold} fill={palette.gold} />
                  <Text style={[styles.glassMetaText, { color: "#FFF7E0" }]}>{heroRating}</Text>
                </View>
              ) : null}
              {activeHeroItem.year ? (
                <View style={styles.glassMetaChip}>
                  <Text style={styles.glassMetaText}>{activeHeroItem.year}</Text>
                </View>
              ) : null}
              <View style={styles.glassMetaChip}>
                <Text style={styles.glassMetaText}>HD</Text>
              </View>
            </View>

            <Text numberOfLines={2} style={styles.heroTitle}>
              {activeHeroItem.name.toUpperCase()}
            </Text>

            <Text numberOfLines={2} style={styles.heroSynopsis}>
              {heroDetail?.description ??
                "Stream full-length episodes and cinema in crisp HD with multi-language subtitles."}
            </Text>

            <View style={styles.heroCtaRow}>
              <GlassPillButton
                label={heroCtaLabel}
                icon={<Play size={16} color={palette.pearlInk} fill={palette.pearlInk} />}
                variant="primary"
                size="tv"
                hasTVPreferredFocus
                onFocus={() => setHeroFocused(true)}
                onBlur={() => setHeroFocused(false)}
                onPress={handlePlayHero}
              />
              <GlassPillButton
                label={heroSaved ? "In My List" : "+ My List"}
                icon={heroSaved ? <Check size={16} color="#FFFFFF" /> : <Plus size={16} color="#FFFFFF" />}
                variant="secondary"
                size="tv"
                onFocus={() => setHeroFocused(true)}
                onBlur={() => setHeroFocused(false)}
                onPress={() =>
                  void toggleWatchlist({
                    subject_id: activeHeroItem.subjectId,
                    detail_path: activeHeroItem.slug,
                    media_type: activeHeroItem.mediaType,
                    title: activeHeroItem.name,
                    poster_url: activeHeroItem.posterUrl,
                  })
                }
              />
              <GlassPillButton
                label="Details & Episodes"
                variant="secondary"
                size="tv"
                onFocus={() => setHeroFocused(true)}
                onBlur={() => setHeroFocused(false)}
                onPress={() => openDetails(activeHeroItem)}
              />
            </View>
          </View>
        ) : null}

        {/* Continue Watching 16:9 Frosted Liquid Glass Rail */}
        {continueWatching.length > 0 ? (
          <View style={styles.railBlock}>
            <Text style={styles.railHeading}>Continue Watching</Text>
            <ContinueWatchingRail
              rows={continueWatching}
              cardWidth={landscapeWidth}
              onSelect={handleResumeCard}
            />
          </View>
        ) : null}

        {/* Virtualized Catalogue Rails */}
        {sections.map((section) => (
          <TvPosterRail
            key={section.section}
            title={section.section}
            items={section.items}
            posterWidth={posterWidth}
            onOpenItem={openDetails}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const ContinueWatchingRail = memo(function ContinueWatchingRail({
  rows,
  cardWidth,
  onSelect,
}: {
  rows: ProgressRow[];
  cardWidth: number;
  onSelect: (row: ProgressRow) => void;
}) {
  const listRef = useRef<FlatList<ProgressRow>>(null);
  return (
    <FlatList
      ref={listRef}
      horizontal
      data={rows}
      keyExtractor={(r) => `${r.subject_id}-${r.season_number ?? 0}-${r.episode_number ?? 0}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
      renderItem={({ item, index }) => {
        const remainingMin = Math.max(1, Math.round((item.duration_seconds - item.position_seconds) / 60));
        const sub =
          item.media_type === "series"
            ? `S${item.season_number ?? 1} · E${item.episode_number ?? 1} · ${
                item.duration_seconds > 0 ? `${remainingMin}m left` : "Resume"
              }`
            : item.duration_seconds > 0
              ? `${remainingMin}m left`
              : "Resume Movie";
        const pct =
          item.duration_seconds > 0
            ? Math.min(COMPLETION_THRESHOLD, item.position_seconds / item.duration_seconds)
            : 0.25;
        return (
          <GlassLandscapeCard
            title={item.title}
            subtitle={sub}
            imageUri={item.poster_url}
            progress={pct}
            width={cardWidth}
            onFocusCard={() => {
              listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
            }}
            onPress={() => onSelect(item)}
          />
        );
      }}
      onScrollToIndexFailed={() => {}}
    />
  );
});

const TvPosterRail = memo(function TvPosterRail({
  title,
  items,
  posterWidth,
  onOpenItem,
}: {
  title: string;
  items: CatalogueItem[];
  posterWidth: number;
  onOpenItem: (item: CatalogueItem) => void;
}) {
  const profile = usePerformanceProfile();
  const listRef = useRef<FlatList<CatalogueItem>>(null);
  const gap = 16;

  return (
    <View style={styles.railBlock}>
      <Text style={styles.railHeading}>{title}</Text>
      <FlatList
        ref={listRef}
        horizontal
        data={items}
        keyExtractor={(item) => item.subjectId}
        showsHorizontalScrollIndicator={false}
        windowSize={profile.listWindowSize}
        maxToRenderPerBatch={profile.maxToRenderPerBatch}
        initialNumToRender={profile.initialNumToRender}
        removeClippedSubviews
        contentContainerStyle={styles.railContent}
        getItemLayout={(_, index) => ({
          length: posterWidth + gap,
          offset: (posterWidth + gap) * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <GlassPosterCard
            item={item}
            width={posterWidth}
            index={index}
            onPress={onOpenItem}
            onFocusItem={(_, idx) => {
              if (typeof idx === "number") {
                listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.18 });
              }
            }}
          />
        )}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  centerState: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: 14,
  },
  stateLabel: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  errorTitle: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  errorBody: {
    color: palette.textSecondary,
    fontSize: 15,
    textAlign: "center",
    maxWidth: 500,
    marginBottom: 8,
  },
  heroBackdropWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    left: "18%",
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 56,
    paddingRight: 28,
  },
  brandWordmark: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 22,
  },
  heroStage: {
    maxWidth: "58%",
    minHeight: 205,
    justifyContent: "flex-end",
    marginBottom: 26,
    gap: 12,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  glassMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(18, 25, 38, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  glassMetaText: {
    color: "#F3F6FA",
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
    lineHeight: 43,
  },
  heroSynopsis: {
    color: palette.textSecondary,
    fontSize: 14.5,
    lineHeight: 21,
  },
  heroCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  railBlock: {
    marginBottom: 26,
  },
  railHeading: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  railContent: {
    gap: 16,
    paddingVertical: 8,
    paddingRight: 28,
  },
});
