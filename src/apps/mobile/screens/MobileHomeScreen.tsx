import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  type CompositeNavigationProp,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Search } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_TAB_BAR_CLEARANCE } from "@/apps/mobile/components/MobileTabBar";
import type { MobileStackParamList, MobileTabParamList } from "@/apps/mobile/navigation/mobileTypes";
import { BRAND_WORDMARK } from "@/config/branding";
import { palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import type { WorldId } from "@/services/provider/categories";
import { prefetchDetail } from "@/services/provider/detailCache";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { takePrefetched } from "@/services/provider/prefetch";
import { useSound } from "@/services/sound/SoundContext";
import { COMPLETION_THRESHOLD, useLibrary, type ProgressRow } from "@/state/LibraryContext";
import type { CatalogueItem, HomeSection, TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { GlassMobileHomeSkeleton } from "@/ui/glass/GlassSkeleton";
import { curateFeaturedItems, MobileHeroShowcase } from "@/ui/glass/HeroShowcase";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type HomeNav = CompositeNavigationProp<
  BottomTabNavigationProp<MobileTabParamList, "Home">,
  NativeStackNavigationProp<MobileStackParamList>
>;

const QUICK_PILLS: { id: "all" | WorldId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "kdrama", label: "K-Drama" },
  { id: "series", label: "Series" },
  { id: "movies", label: "Movies" },
  { id: "anime", label: "Anime" },
];

/**
 * 1:1 Hallyu Mobile Home Screen (`docs/ui-previews/mobile-01-home.png`):
 * - Virtualized vertical FlatList of rails for instant launch on 2 GB RAM phones
 * - Auto-Transitioning 6-Drama Liquid Glass Featured Hero Showcase (swipe + pill dots)
 * - 0ms instant Player navigation + SWR Detail prefetching
 */
export function MobileHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { play } = useSound();
  const { progress, inWatchlist, toggleWatchlist, latestFor } = useLibrary();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePill, setActivePill] = useState<"all" | WorldId>("all");
  const [ambientPosterUri, setAmbientPosterUri] = useState<string | null>(null);

  const loadCatalogue = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    setError(null);
    let hadCached = false;
    if (!isPull) {
      const cached = await hydrateHome();
      if (cached && cached.length > 0) {
        hadCached = true;
        setSections(cached);
        setAmbientPosterUri((prev) => prev ?? cached[0]?.items[0]?.posterUrl ?? null);
        setLoading(false);
      }
    }
    try {
      const fresh = await loadHome();
      if (fresh.length > 0) {
        setSections(fresh);
        setAmbientPosterUri((prev) => prev ?? fresh[0]?.items[0]?.posterUrl ?? null);
      } else if (!hadCached) {
        setError("No catalogue sections returned.");
      }
    } catch {
      if (!hadCached) {
        setError("Could not reach the Hallyu catalogue. Check your connection and retry.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogue(false);
  }, [loadCatalogue]);

  const filteredSections = useMemo(() => {
    if (activePill === "all") return sections;
    if (activePill === "series") {
      return sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.mediaType === "series") }))
        .filter((s) => s.items.length > 0);
    }
    if (activePill === "movies") {
      return sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.mediaType === "movie") }))
        .filter((s) => s.items.length > 0);
    }
    if (activePill === "kdrama") {
      const matched = sections.filter((s) => /k-?drama|korea|drama|trending/i.test(s.section));
      return matched.length > 0 ? matched : sections;
    }
    if (activePill === "anime") {
      const matched = sections.filter((s) => /anime|animation/i.test(s.section));
      return matched.length > 0 ? matched : sections;
    }
    return sections;
  }, [activePill, sections]);

  const featuredSlides = useMemo(
    () => curateFeaturedItems(filteredSections.length > 0 ? filteredSections : sections, 6),
    [filteredSections, sections],
  );

  const continueWatching = useMemo(
    () => progress.filter((p) => !p.completed && p.position_seconds > 5).slice(0, 12),
    [progress],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      prefetchDetail(item.slug);
      navigation.navigate("MobileDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation],
  );

  // 0ms Instant Player Navigation — uses pre-warmed stream if ready or resolves inside Player!
  const handleWatchHero = useCallback(
    (item: CatalogueItem, detail: TitleDetail | null) => {
      const resume = latestFor(item.subjectId);
      const isSeries = (detail?.mediaType ?? item.mediaType) === "series";
      const se = isSeries ? (resume?.season_number ?? detail?.seasons[0]?.season ?? 1) : 0;
      const ep = isSeries ? (resume?.episode_number ?? 1) : 0;
      const maxEp = detail?.seasons.find((s) => s.season === se)?.maxEp ?? 0;
      const warm = takePrefetched(item.subjectId, item.slug, se, ep);

      navigation.navigate("MobilePlayer", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
        mediaType: isSeries ? "series" : "movie",
        season: se,
        episode: ep,
        maxEpisodesInSeason: maxEp,
        resumeAt: resume && !resume.completed ? resume.position_seconds : 0,
        sources: warm?.sources ?? [],
        nextEpisode: isSeries && (maxEp === 0 || ep < maxEp) ? { season: se, episode: ep + 1 } : null,
      });
    },
    [latestFor, navigation],
  );

  const handleToggleHeroWatchlist = useCallback(
    (item: CatalogueItem) => {
      play("confirm", { intensity: 0.4 });
      void toggleWatchlist({
        subject_id: item.subjectId,
        detail_path: item.slug,
        media_type: item.mediaType,
        title: item.name,
        poster_url: item.posterUrl,
      });
    },
    [play, toggleWatchlist],
  );

  const handleResumeRow = useCallback(
    (row: ProgressRow) => {
      if (!row.detail_path) return;
      const isSeries = row.media_type === "series";
      const se = isSeries ? (row.season_number ?? 1) : 0;
      const ep = isSeries ? (row.episode_number ?? 1) : 0;
      const warm = takePrefetched(row.subject_id, row.detail_path, se, ep);
      navigation.navigate("MobilePlayer", {
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

  const posterWidth = Math.max(102, Math.floor((stage.width - 36 - 22) / 3));
  const continueWidth = Math.min(252, Math.round(stage.width * 0.62));
  const heroHeight = Math.min(410, Math.round(stage.width * 1.02));
  const onShowExplore = useCallback(() => navigation.navigate("Explore"), [navigation]);

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas
        imageUri={ambientPosterUri ?? featuredSlides[0]?.posterUrl}
        intensity="rich"
      />

      <FlatList
        data={loading && sections.length === 0 ? [] : filteredSections}
        keyExtractor={(sec) => sec.section}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={profile.listWindowSize}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadCatalogue(true)}
            tintColor={palette.accent}
          />
        }
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + MOBILE_TAB_BAR_CLEARANCE,
          gap: 18,
        }}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            {/* Header: HALLYU + coral dot & Frosted Liquid Glass Search Pill */}
            <View style={styles.topHeader}>
              <View style={styles.brandRow}>
                <Text style={styles.wordmark}>{BRAND_WORDMARK}</Text>
                <View style={styles.brandDot} />
              </View>

              <Pressable
                accessible
                accessibilityRole="search"
                accessibilityLabel="Search dramas, movies and anime"
                onPress={() => navigation.navigate("Explore", { autoFocusSearch: true })}
                style={styles.searchPillFlex}
              >
                <LiquidGlassView
                  variant="frosted"
                  borderRadius={radius.pill}
                  contentStyle={styles.searchPillInner}
                >
                  <Text numberOfLines={1} style={styles.searchPlaceholder}>
                    Search dramas, movies…
                  </Text>
                  <Search size={16} color={palette.textSecondary} />
                </LiquidGlassView>
              </Pressable>
            </View>

            {/* Quick Liquid Glass Category Capsules */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow}
            >
              {QUICK_PILLS.map((pill) => (
                <GlassPillButton
                  key={pill.id}
                  label={pill.label}
                  size="sm"
                  variant={activePill === pill.id ? "pearl" : "secondary"}
                  active={activePill === pill.id}
                  onPress={() => {
                    if (pill.id === "anime") {
                      navigation.navigate("Explore", { initialWorld: "anime" });
                    } else {
                      setActivePill(pill.id);
                    }
                  }}
                />
              ))}
            </ScrollView>

            {loading && sections.length === 0 ? (
              <GlassMobileHomeSkeleton posterWidth={posterWidth} />
            ) : error && sections.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.errorTitle}>Connection Issue</Text>
                <Text style={styles.stateText}>{error}</Text>
                <GlassPillButton
                  label="Retry"
                  variant="primary"
                  onPress={() => void loadCatalogue(false)}
                />
              </View>
            ) : (
              <>
                {/* Auto-Transitioning 6-Drama Liquid Glass Featured Hero Showcase */}
                {featuredSlides.length > 0 ? (
                  <MobileHeroShowcase
                    items={featuredSlides}
                    cardHeight={heroHeight}
                    screenFocused={isFocused}
                    inWatchlist={inWatchlist}
                    latestFor={latestFor}
                    onWatchNow={handleWatchHero}
                    onOpenDetails={openDetails}
                    onToggleWatchlist={handleToggleHeroWatchlist}
                    onActivePosterChange={setAmbientPosterUri}
                  />
                ) : null}

                {/* Continue Watching 16:9 Glass-Rimmed Rail */}
                {continueWatching.length > 0 ? (
                  <View style={styles.sectionWrap}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Continue Watching</Text>
                    </View>
                    <FlatList
                      horizontal
                      data={continueWatching}
                      keyExtractor={(r) =>
                        `${r.subject_id}-${r.season_number ?? 0}-${r.episode_number ?? 0}`
                      }
                      showsHorizontalScrollIndicator={false}
                      initialNumToRender={3}
                      maxToRenderPerBatch={4}
                      windowSize={profile.listWindowSize}
                      getItemLayout={(_, index) => ({
                        length: continueWidth + 11,
                        offset: (continueWidth + 11) * index,
                        index,
                      })}
                      contentContainerStyle={styles.railPad}
                      renderItem={({ item }) => {
                        const pct =
                          item.duration_seconds > 0
                            ? Math.min(
                                COMPLETION_THRESHOLD,
                                item.position_seconds / item.duration_seconds,
                              )
                            : 0.25;
                        const rightMeta =
                          item.media_type === "series"
                            ? `Ep. ${item.episode_number ?? 1}`
                            : "Movie";
                        const rem =
                          item.duration_seconds > 0
                            ? `${Math.max(
                                1,
                                Math.round((item.duration_seconds - item.position_seconds) / 60),
                              )}m left`
                            : "Resume";
                        return (
                          <GlassLandscapeCard
                            title={item.title}
                            subtitle={rem}
                            rightMeta={rightMeta}
                            imageUri={item.poster_url}
                            progress={pct}
                            width={continueWidth}
                            onPress={() => handleResumeRow(item)}
                          />
                        );
                      }}
                    />
                  </View>
                ) : null}
              </>
            )}
          </View>
        }
        renderItem={({ item: sec }) => (
          <MobilePosterRail
            title={sec.section}
            items={sec.items}
            posterWidth={posterWidth}
            onOpen={openDetails}
            onShowAll={onShowExplore}
          />
        )}
      />
    </View>
  );
}

const MobilePosterRail = memo(function MobilePosterRail({
  title,
  items,
  posterWidth,
  onOpen,
  onShowAll,
}: {
  title: string;
  items: CatalogueItem[];
  posterWidth: number;
  onOpen: (item: CatalogueItem) => void;
  onShowAll: () => void;
}) {
  const profile = usePerformanceProfile();
  const gap = 11;

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <Text numberOfLines={1} style={styles.sectionTitle}>
          {title}
        </Text>
        <Pressable onPress={onShowAll} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>Explore</Text>
          <ChevronRight size={14} color={palette.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.subjectId}
        showsHorizontalScrollIndicator={false}
        windowSize={profile.listWindowSize}
        maxToRenderPerBatch={profile.maxToRenderPerBatch}
        initialNumToRender={4}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: posterWidth + gap,
          offset: (posterWidth + gap) * index,
          index,
        })}
        contentContainerStyle={styles.railPad}
        renderItem={({ item }) => (
          <GlassPosterCard item={item} width={posterWidth} onPress={onOpen} />
        )}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  headerStack: {
    gap: 18,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    gap: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 3,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: palette.accentBright,
    marginTop: 4,
  },
  searchPillFlex: {
    flex: 1,
  },
  searchPillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
  },
  searchPlaceholder: {
    flex: 1,
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  pillsRow: {
    paddingHorizontal: 18,
    gap: 9,
  },
  centerBox: {
    paddingVertical: 64,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  stateText: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    flex: 1,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  showMoreText: {
    color: palette.textSecondary,
    fontSize: 12.5,
    fontWeight: "600",
  },
  railPad: {
    paddingHorizontal: 18,
    gap: 11,
  },
});
