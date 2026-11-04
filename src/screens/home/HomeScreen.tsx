import { StageRail, type RailEntry } from "@/components/stage/StageRail";
import { HeroStage } from "@/components/tv/HeroStage";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { APP_NAME } from "@/config/branding";
import { stagger } from "@/design-system/motion";
import { palette, gradients, radius, spacing } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList, TabParamList } from "@/navigation/RootNavigator";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { useLibrary, type ProgressRow } from "@/state/LibraryContext";
import { ProviderError, type HomeSection } from "@/types/provider";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList> & BottomTabNavigationProp<TabParamList, "Home">;
type Open = (detailPath: string, subjectId: string) => void;

export function HomeScreen() {
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();

  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSections(await loadHome());
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Could not reach the catalogue. Check your connection.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void hydrateHome().then((cached) => {
      if (mounted && cached) setSections(cached);
    });
    void load();
    return () => {
      mounted = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const open = useCallback<Open>(
    (detailPath, subjectId) => navigation.navigate("Details", { detailPath, subjectId }),
    [navigation],
  );

  const heroes = useMemo(() => {
    const banner = (sections ?? []).find((section) => section.section === "Banner")?.items ?? [];
    const everything = (sections ?? []).flatMap((section) => section.items);
    const seen = new Set<string>();
    return [...banner, ...everything]
      .filter((item) => (seen.has(item.subjectId) ? false : (seen.add(item.subjectId), true)))
      .slice(0, 5);
  }, [sections]);

  const rails = useMemo(
    () => (sections ?? []).filter((section) => section.items.length > 0 && section.section !== "Banner"),
    [sections],
  );

  const resume = useMemo(
    () => progress.filter((row) => !row.completed && row.position_seconds > 5).slice(0, 20),
    [progress],
  );

  const resumeEntries = useMemo(() => resume.map((row) => toResumeEntry(row, open)), [resume, open]);
  const watchlistEntries = useMemo(() => watchlist.map((item) => toLibraryEntry(item, open)), [watchlist, open]);

  const empty = sections !== null && heroes.length === 0 && rails.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs }]}>
      <AmbientGlow />

      {/* Floating Liquid Header */}
      <View style={[styles.header, { paddingHorizontal: stage.gutter, marginBottom: stage.cardGap }]}>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandBadge}
          />
          <Text style={[styles.brand, { fontSize: stage.tier === "compact" ? 22 : Math.round(stage.u * 3.8) }]}>
            {APP_NAME}
          </Text>
        </View>

        <Pressable
          style={[
            styles.searchPill,
            {
              height: Math.max(38, stage.controlSize * 0.8),
            },
          ]}
          onPress={() => navigation.navigate("Discover")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Search size={16} color={palette.textSecondary} />
          <Text style={styles.searchPrompt}>Search films & series</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
      >
        {error && sections === null ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {sections === null && !error ? (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <SkeletonRail itemWidth={stage.posterWidth} count={4} />
            <SkeletonRail itemWidth={stage.posterWidth} count={4} />
          </View>
        ) : null}

        {empty ? (
          <EmptyState title="Nothing here yet" message="The catalogue is empty right now. Pull to refresh later." />
        ) : null}

        {heroes.length > 0 ? (
          <HeroStage items={heroes} stage={stage} onOpen={(item) => open(item.slug, item.subjectId)} />
        ) : null}

        {resumeEntries.length > 0 ? (
          <StageRail label="Continue Watching" entries={resumeEntries} stage={stage} delay={40} />
        ) : null}

        {rails.map((section, index) => (
          <StageRail
            key={section.section}
            label={sectionLabel(section.section)}
            stage={stage}
            delay={60 + index * stagger}
            entries={section.items.map((item) => ({
              key: `${section.section}_${item.subjectId}`,
              posterUrl: item.posterUrl,
              title: item.name,
              meta: [item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · "),
              progress: null,
              onPress: () => open(item.slug, item.subjectId),
            }))}
          />
        ))}

        {watchlistEntries.length > 0 ? (
          <StageRail label="Saved to Watchlist" entries={watchlistEntries} stage={stage} delay={60 + rails.length * stagger} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function toResumeEntry(row: ProgressRow, open: Open): RailEntry {
  const percent =
    row.duration_seconds > 0 ? Math.round((row.position_seconds / row.duration_seconds) * 100) : null;
  return {
    key: `${row.subject_id}_${row.season_number ?? 0}_${row.episode_number ?? 0}`,
    posterUrl: row.poster_url,
    title: row.title,
    meta:
      row.media_type === "series"
        ? `S${row.season_number ?? 1} · E${row.episode_number ?? 1}`
        : "Movie",
    progress: percent,
    onPress: () => { if (row.detail_path) open(row.detail_path, row.subject_id); },
  };
}

function toLibraryEntry(item: any, open: Open): RailEntry {
  return {
    key: `lib_${item.subject_id}`,
    posterUrl: item.poster_url,
    title: item.title,
    meta: [item.year, item.media_type === "series" ? "Series" : "Movie"].filter(Boolean).join(" · "),
    progress: null,
    onPress: () => { if (item.detail_path) open(item.detail_path, item.subject_id); },
  };
}

function sectionLabel(raw: string): string {
  const map: Record<string, string> = {
    Latest: "Fresh Releases",
    Trending: "Trending Worldwide",
    Popular: "Global Blockbusters",
    Drama: "Prestige Drama",
    Action: "Adrenaline & Action",
    Comedy: "Heartfelt Comedy",
    Romance: "Romantic Cinema",
    Anime: "Animation & Anime",
  };
  return map[raw] ?? raw;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  brand: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  searchPill: {
    flex: 1,
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  searchPrompt: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
});
