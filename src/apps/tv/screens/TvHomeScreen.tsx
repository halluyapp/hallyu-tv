import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { palette, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { prefetchDetail } from "@/services/provider/detailCache";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { takePrefetched } from "@/services/provider/prefetch";
import { COMPLETION_THRESHOLD, useLibrary, type ProgressRow } from "@/state/LibraryContext";
import type { CatalogueItem, HomeSection, TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { GlassTvHomeSkeleton } from "@/ui/glass/GlassSkeleton";
import { curateFeaturedItems, TvHeroShowcase } from "@/ui/glass/HeroShowcase";

type Nav = NativeStackNavigationProp<TvStackParamList>;

const LEFT_CONTENT_INSET = COLLAPSED_RAIL_WIDTH + 44;

/**
 * 1:1 Hallyu TV Home Screen (`docs/ui-previews/tv-01-home.png`):
 * - Full-bleed widescreen cinema hero stage auto-transitioning through 6 featured dramas
 * - Virtualized vertical FlatList of rails for instant startup on budget TV sticks
 * - 0ms instant Player navigation + D-pad focus memory when returning Back from Details
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
  const [heroBackdropUri, setHeroBackdropUri] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const refreshCatalogue = useCallback(async () => {
    setError(null);
    let hadCached = false;
    const cached = await hydrateHome();
    if (cached && cached.length > 0) {
      hadCached = true;
      setSections(cached);
      setHeroBackdropUri((prev) => prev ?? cached[0]?.items[0]?.posterUrl ?? null);
      setLoading(false);
    }
    try {
      const fresh = await loadHome();
      if (fresh.length > 0) {
        setSections(fresh);
        setHeroBackdropUri((prev) => prev ?? fresh[0]?.items[0]?.posterUrl ?? null);
      } else if (!hadCached) {
        setError("No catalogue sections returned right now.");
      }
    } catch {
      if (!hadCached) {
        setError("Could not reach the Hallyu streaming catalogue. Check your network and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalogue();
  }, [refreshCatalogue]);

  const featuredSlides = useMemo(() => curateFeaturedItems(sections, 6), [sections]);

  const continueWatching = useMemo(
    () =>
      progress
        .filter((row) => !row.completed && row.position_seconds > 5)
        .slice(0, 14),
    [progress],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      setLastClickedId(item.subjectId);
      prefetchDetail(item.slug);
      navigation.navigate("TvDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation],
  );

  // 0ms Instant TV Player Launch — opens full-screen player immediately!
  const handlePlayHero = useCallback(
    (item: CatalogueItem, detail: TitleDetail | null) => {
      const resume = latestFor(item.subjectId);
      const isSeries = (detail?.mediaType ?? item.mediaType) === "series";
      const season = isSeries ? (resume?.season_number ?? detail?.seasons[0]?.season ?? 1) : 0;
      const episode = isSeries ? (resume?.episode_number ?? 1) : 0;
      const maxEp = detail?.seasons.find((s) => s.season === season)?.maxEp ?? 0;
      const warm = takePrefetched(item.subjectId, item.slug, season, episode);

      navigation.navigate("TvPlayer", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
        mediaType: isSeries ? "series" : "movie",
        season,
        episode,
        maxEpisodesInSeason: maxEp,
        resumeAt: resume && !resume.completed ? resume.position_seconds : 0,
        sources: warm?.sources ?? [],
        nextEpisode:
          isSeries && (maxEp === 0 || episode < maxEp) ? { season, episode: episode + 1 } : null,
      });
    },
    [latestFor, navigation],
  );

  const handleToggleHeroWatchlist = useCallback(
    (item: CatalogueItem) => {
      void toggleWatchlist({
        subject_id: item.subjectId,
        detail_path: item.slug,
        media_type: item.mediaType,
        title: item.name,
        poster_url: item.posterUrl,
      });
    },
    [toggleWatchlist],
  );

  const handleResumeCard = useCallback(
    (row: ProgressRow) => {
      if (!row.detail_path) return;
      const isSeries = row.media_type === "series";
      const se = isSeries ? (row.season_number ?? 1) : 0;
      const ep = isSeries ? (row.episode_number ?? 1) : 0;
      const warm = takePrefetched(row.subject_id, row.detail_path, se, ep);
      navigation.navigate("TvPlayer", {
        subjectId: row.subject_id,
        detailPath: row.detail_path,
        title: row.title,
        posterUrl: row.poster_url,
        mediaType: row.media_type,
        season: se,
        episode: ep,
        resumeAt: row.position_seconds,
        sources: warm?.sources ?? [],
        nextEpisode: isSeries ? { season: se, episode: ep + 1 } : null,
      });
    },
    [navigation],
  );

  const posterWidth = Math.max(
    142,
    Math.min(186, Math.round((stage.width - LEFT_CONTENT_INSET - 40) / 5.7)),
  );
  const landscapeWidth = Math.max(
    240,
    Math.min(300, Math.round((stage.width - LEFT_CONTENT_INSET - 40) / 3.6)),
  );

  if (loading && sections.length === 0) {
    return (
      <View style={styles.root}>
        <AmbientArtworkCanvas intensity="subtle" />
        <GlassTvHomeSkeleton posterWidth={posterWidth} leftInset={LEFT_CONTENT_INSET} />
      </View>
    );
  }

  if (error && sections.length === 0) {
    return (
      <View style={styles.centerState}>
        <AmbientArtworkCanvas intensity="subtle" />
        <Text style={styles.errorTitle}>Catalogue Unavailable</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <GlassPillButton
          label="Retry Connection"
          variant="primary"
          size="tv"
          hasTVPreferredFocus
          onPress={refreshCatalogue}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={heroBackdropUri} intensity="rich" />

      {/* Top-right full-bleed hero artwork melting into the Liquid Glass canvas */}
      {heroBackdropUri ? (
        <View
          style={[
            styles.heroBackdropWrap,
            { height: Math.max(330, Math.round(stage.height * 0.68)) },
          ]}
          pointerEvents="none"
        >
          <ExpoImage
            source={{ uri: heroBackdropUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={profile.isLowRam ? 220 : 420}
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

      <FlatList
        data={sections}
        keyExtractor={(s) => s.section}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={profile.listWindowSize}
        removeClippedSubviews
        contentContainerStyle={[styles.scrollContent, { paddingLeft: LEFT_CONTENT_INSET }]}
        ListHeaderComponent={
          <View>
            <Text style={styles.brandWordmark}>Hallyu TV</Text>

            {featuredSlides.length > 0 ? (
              <TvHeroShowcase
                items={featuredSlides}
                screenFocused={isFocused}
                inWatchlist={inWatchlist}
                latestFor={latestFor}
                preferInitialFocus={lastClickedId === null}
                onWatchNow={handlePlayHero}
                onOpenDetails={openDetails}
                onToggleWatchlist={handleToggleHeroWatchlist}
                onHeroBackdropChange={setHeroBackdropUri}
              />
            ) : null}

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
          </View>
        }
        renderItem={({ item: section }) => (
          <TvPosterRail
            title={section.section}
            items={section.items}
            posterWidth={posterWidth}
            preferredSubjectId={lastClickedId}
            onOpenItem={openDetails}
          />
        )}
      />
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
  const gap = 16;
  return (
    <FlatList
      ref={listRef}
      horizontal
      data={rows}
      keyExtractor={(r) => `${r.subject_id}-${r.season_number ?? 0}-${r.episode_number ?? 0}`}
      showsHorizontalScrollIndicator={false}
      getItemLayout={(_, index) => ({
        length: cardWidth + gap,
        offset: (cardWidth + gap) * index,
        index,
      })}
      contentContainerStyle={styles.railContent}
      renderItem={({ item, index }) => {
        const remainingMin = Math.max(
          1,
          Math.round((item.duration_seconds - item.position_seconds) / 60),
        );
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
  preferredSubjectId,
  onOpenItem,
}: {
  title: string;
  items: CatalogueItem[];
  posterWidth: number;
  preferredSubjectId: string | null;
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
            hasTVPreferredFocus={preferredSubjectId === item.subjectId}
            onPress={onOpenItem}
            onFocusItem={(focusedItem, idx) => {
              prefetchDetail(focusedItem.slug);
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
