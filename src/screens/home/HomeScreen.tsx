import { StageRail, type RailEntry } from "@/components/stage/StageRail";
import { HeroStage } from "@/components/tv/HeroStage";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { APP_NAME } from "@/config/branding";
import { stagger } from "@/design-system/motion";
import { gradients, palette, radius, spacing } from "@/design-system/tokens";
import { useCatalogue } from "@/hooks/useCatalogue";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList, TabParamList } from "@/navigation/RootNavigator";
import type { CatalogueShelf } from "@/services/catalogue";
import { BROWSE_WORLDS, type WorldKey } from "@/services/catalogue/worlds";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Search } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList> & BottomTabNavigationProp<TabParamList, "Home">;
type Open = (detailPath: string, subjectId: string) => void;

/** Worlds offered as quick chips under the hero. */
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

/**
 * Mobile home.
 *
 * Keeps the Liquid Glass identity while reading the shared catalogue service,
 * so the phone and the TV show the same shelves: originals first, the provider's
 * own ranking as Trending, then worlds and genres.
 */
export function HomeScreen() {
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();
  const { snapshot, loading, error, refreshing, refresh } = useCatalogue();

  const open = useCallback<Open>(
    (detailPath, subjectId) => navigation.navigate("Details", { detailPath, subjectId }),
    [navigation],
  );

  const heroes = snapshot?.hero ?? [];
  // Home shows the curated core; Explore carries the long tail of worlds.
  const shelves = (snapshot?.shelves ?? []).slice(0, 18);

  const resume = useMemo(
    () => progress.filter((row) => !row.completed && row.position_seconds > 5).slice(0, 20),
    [progress],
  );

  const resumeEntries = useMemo(() => resume.map((row) => toResumeEntry(row, open)), [resume, open]);
  const watchlistEntries = useMemo(() => watchlist.map((item) => toLibraryEntry(item, open)), [watchlist, open]);

  const openCollection = useCallback(
    (shelf: CatalogueShelf) => {
      const target = shelfTarget(shelf);
      navigation.navigate("Discover", { world: target.world, genre: target.genre });
    },
    [navigation],
  );

  const empty = !loading && !error && snapshot !== null && heroes.length === 0 && shelves.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs }]}>
      <AmbientGlow />

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
          style={[styles.searchPill, { height: Math.max(38, stage.controlSize * 0.8) }]}
          onPress={() => navigation.navigate("Discover", { world: "all", genre: null })}
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
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.accent} />
        }
      >
        {error && !snapshot ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

        {!snapshot && loading ? (
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.worldRow, { paddingHorizontal: stage.gutter }]}
        >
          {QUICK_WORLDS.map((key) => {
            const label = BROWSE_WORLDS.find((world) => world.key === key)?.label ?? key;
            return (
              <Pressable
                key={key}
                onPress={() => navigation.navigate("Discover", { world: key, genre: null })}
                style={styles.worldChip}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${label}`}
              >
                <Text style={styles.worldLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {resumeEntries.length > 0 ? (
          <StageRail label="Continue Watching" entries={resumeEntries} stage={stage} delay={40} />
        ) : null}

        {shelves.map((shelf, index) => (
          <StageRail
            key={shelf.key}
            label={shelf.subtitle ? `${shelf.title} · ${shelf.subtitle}` : shelf.title}
            stage={stage}
            delay={60 + index * stagger}
            onSeeAll={() => openCollection(shelf)}
            entries={shelf.items.map((item) => ({
              key: `${shelf.key}_${item.subjectId}`,
              posterUrl: item.posterUrl,
              title: item.displayName ?? item.name,
              meta: [item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · "),
              progress: null,
              onPress: () => open(item.slug, item.subjectId),
            }))}
          />
        ))}

        {watchlistEntries.length > 0 ? (
          <StageRail
            label="Saved to Watchlist"
            entries={watchlistEntries}
            stage={stage}
            delay={60 + shelves.length * stagger}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function shelfTarget(shelf: CatalogueShelf): { world: WorldKey; genre: string | null } {
  if (shelf.key.startsWith("genre-")) return { world: "all", genre: shelf.title };
  const fromSection = shelf.key.replace(/^section-/, "");
  const known = BROWSE_WORLDS.find((world) => world.key === fromSection);
  if (known) return { world: known.key, genre: null };
  return SHELF_TARGETS[shelf.key] ?? { world: "all", genre: null };
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
    onPress: () => {
      if (row.detail_path) open(row.detail_path, row.subject_id);
    },
  };
}

function toLibraryEntry(item: LibraryTitle, open: Open): RailEntry {
  return {
    key: `lib_${item.subject_id}`,
    posterUrl: item.poster_url,
    title: item.title,
    meta: item.media_type === "series" ? "Series" : "Movie",
    progress: null,
    onPress: () => {
      if (item.detail_path) open(item.detail_path, item.subject_id);
    },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandBadge: { width: 12, height: 12, borderRadius: 6 },
  brand: { color: "#FFFFFF", fontWeight: "800", letterSpacing: -0.6 },
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
  searchPrompt: { color: palette.textMuted, fontSize: 12, fontWeight: "500" },
  worldRow: { gap: 8, paddingVertical: 16 },
  worldChip: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  worldLabel: { color: palette.textPrimary, fontSize: 12.5, fontWeight: "700" },
});
