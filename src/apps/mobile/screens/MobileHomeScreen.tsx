import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { type CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image as ExpoImage } from "expo-image";
import { Check, ChevronRight, Play, Plus, Search, Star } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { resolveStreams } from "@/services/provider/adapter";
import type { WorldId } from "@/services/provider/categories";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { COMPLETION_THRESHOLD, useLibrary, type ProgressRow } from "@/state/LibraryContext";
import type { CatalogueItem, HomeSection } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
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
 * - 'HALLYU' wordmark + coral dot on left, Frosted Liquid Glass Search pill on right
 * - Quick Liquid Glass category capsules ('All' pearl-glass active pill, 'K-Drama', 'Series', 'Movies', 'Anime')
 * - Rounded 28px Featured Cinema Hero Card with embedded Frosted Liquid Glass overlay card
 * - 16:9 'Continue Watching' rail + virtualized 3-across poster rails tuned for 2 GB RAM
 */
export function MobileHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { progress, inWatchlist, toggleWatchlist, latestFor } = useLibrary();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePill, setActivePill] = useState<"all" | WorldId>("all");
  const [openingHero, setOpeningHero] = useState(false);

  const loadCatalogue = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    setError(null);
    if (!isPull) {
      const cached = await hydrateHome();
      if (cached && cached.length > 0) {
        setSections(cached);
        setLoading(false);
      }
    }
    try {
      const fresh = await loadHome();
      if (fresh.length > 0) setSections(fresh);
      else if (sections.length === 0) setError("No catalogue sections returned.");
    } catch {
      if (sections.length === 0) {
        setError("Could not reach the Hallyu catalogue. Check your connection and retry.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sections.length]);

  useEffect(() => {
    void loadCatalogue(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const heroItem = useMemo(
    () => filteredSections[0]?.items[0] ?? sections[0]?.items[0] ?? null,
    [filteredSections, sections],
  );

  const continueWatching = useMemo(
    () => progress.filter((p) => !p.completed && p.position_seconds > 5).slice(0, 12),
    [progress],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      navigation.navigate("MobileDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation],
  );

  const handleWatchHero = useCallback(async () => {
    if (!heroItem || openingHero) return;
    setOpeningHero(true);
    try {
      const resume = latestFor(heroItem.subjectId);
      const isSeries = heroItem.mediaType === "series";
      const se = isSeries ? (resume?.season_number ?? 1) : 0;
      const ep = isSeries ? (resume?.episode_number ?? 1) : 0;
      const res = await resolveStreams(heroItem.subjectId, heroItem.slug, se, ep);
      navigation.navigate("MobilePlayer", {
        subjectId: heroItem.subjectId,
        detailPath: heroItem.slug,
        title: heroItem.name,
        posterUrl: heroItem.posterUrl,
        mediaType: heroItem.mediaType,
        season: se,
        episode: ep,
        resumeAt: resume && !resume.completed ? resume.position_seconds : 0,
        sources: res.sources,
        nextEpisode: isSeries ? { season: se, episode: ep + 1 } : null,
      });
    } catch {
      openDetails(heroItem);
    } finally {
      setOpeningHero(false);
    }
  }, [heroItem, latestFor, navigation, openDetails, openingHero]);

  const handleResumeRow = useCallback(
    (row: ProgressRow) => {
      if (!row.detail_path) return;
      const isSeries = row.media_type === "series";
      const se = isSeries ? (row.season_number ?? 1) : 0;
      const ep = isSeries ? (row.episode_number ?? 1) : 0;
      navigation.navigate("MobilePlayer", {
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

  const posterWidth = Math.max(102, Math.floor((stage.width - 36 - 20) / 3));
  const continueWidth = Math.min(252, Math.round(stage.width * 0.62));
  const heroSaved = heroItem ? inWatchlist(heroItem.subjectId) : false;
  const heroRating = useMemo(() => {
    const n = heroItem?.rating ? parseFloat(heroItem.rating) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  }, [heroItem?.rating]);

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={heroItem?.posterUrl} intensity="rich" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadCatalogue(true)}
            tintColor={palette.accent}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + MOBILE_TAB_BAR_CLEARANCE,
          },
        ]}
      >
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
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={palette.accent} />
            <Text style={styles.stateText}>Loading cinema & dramas…</Text>
          </View>
        ) : error && sections.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorTitle}>Connection Issue</Text>
            <Text style={styles.stateText}>{error}</Text>
            <GlassPillButton label="Retry" variant="primary" onPress={() => void loadCatalogue(false)} />
          </View>
        ) : (
          <>
            {/* Featured Cinema Hero Card with Embedded Frosted Liquid Glass Overlay Card */}
            {heroItem ? (
              <Pressable
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Featured: ${heroItem.name}`}
                onPress={() => openDetails(heroItem)}
                style={styles.heroOuter}
              >
                <View style={[styles.heroCard, { height: Math.min(410, Math.round(stage.width * 1.02)) }]}>
                  {heroItem.posterUrl ? (
                    <ExpoImage
                      source={{ uri: heroItem.posterUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={profile.imageTransitionMs}
                    />
                  ) : null}

                  <View style={styles.heroGlassPad}>
                    <LiquidGlassView
                      variant="frosted"
                      borderRadius={22}
                      blurIntensity={42}
                      contentStyle={styles.heroGlassInner}
                    >
                      <View style={styles.heroMetaRow}>
                        <View style={styles.heroChip}>
                          <Text style={styles.heroChipText}>
                            {heroItem.mediaType === "series" ? "K-Drama & Series" : "Feature Film"}
                          </Text>
                        </View>
                        {heroRating ? (
                          <View style={styles.heroChip}>
                            <Star size={11} color={palette.gold} fill={palette.gold} />
                            <Text style={[styles.heroChipText, { color: "#FFF7E0" }]}>{heroRating}</Text>
                          </View>
                        ) : null}
                        {heroItem.year ? (
                          <View style={styles.heroChip}>
                            <Text style={styles.heroChipText}>{heroItem.year}</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text numberOfLines={2} style={styles.heroTitle}>
                        {heroItem.name.toUpperCase()}
                      </Text>

                      <View style={styles.heroButtonsRow}>
                        <GlassPillButton
                          label={openingHero ? "Opening…" : "Watch Now"}
                          icon={<Play size={14} color="#FFFFFF" fill="#FFFFFF" />}
                          variant="primary"
                          size="md"
                          onPress={handleWatchHero}
                          style={{ flex: 1 }}
                        />
                        <GlassPillButton
                          label={heroSaved ? "Saved" : "+ My List"}
                          icon={heroSaved ? <Check size={14} color="#FFFFFF" /> : <Plus size={14} color="#FFFFFF" />}
                          variant="secondary"
                          size="md"
                          onPress={() =>
                            void toggleWatchlist({
                              subject_id: heroItem.subjectId,
                              detail_path: heroItem.slug,
                              media_type: heroItem.mediaType,
                              title: heroItem.name,
                              poster_url: heroItem.posterUrl,
                            })
                          }
                          style={{ flex: 1 }}
                        />
                      </View>
                    </LiquidGlassView>
                  </View>
                </View>
              </Pressable>
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
                  keyExtractor={(r) => `${r.subject_id}-${r.season_number ?? 0}-${r.episode_number ?? 0}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railPad}
                  renderItem={({ item }) => {
                    const pct =
                      item.duration_seconds > 0
                        ? Math.min(COMPLETION_THRESHOLD, item.position_seconds / item.duration_seconds)
                        : 0.25;
                    const rightMeta =
                      item.media_type === "series" ? `Ep. ${item.episode_number ?? 1}` : "Movie";
                    const rem =
                      item.duration_seconds > 0
                        ? `${Math.max(1, Math.round((item.duration_seconds - item.position_seconds) / 60))}m left`
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

            {/* Virtualized Catalogue Rails */}
            {filteredSections.map((sec) => (
              <MobilePosterRail
                key={sec.section}
                title={sec.section}
                items={sec.items}
                posterWidth={posterWidth}
                onOpen={openDetails}
                onShowAll={() => navigation.navigate("Explore")}
              />
            ))}
          </>
        )}
      </ScrollView>
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
  scrollContent: {
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
  heroOuter: {
    paddingHorizontal: 18,
  },
  heroCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    borderColor: palette.glassStrokeBright,
    borderWidth: 1,
    justifyContent: "flex-end",
  },
  heroGlassPad: {
    padding: 12,
  },
  heroGlassInner: {
    padding: 15,
    gap: 10,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10, 14, 22, 0.56)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroChipText: {
    color: "#F4F7FB",
    fontSize: 11,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  heroButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
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
