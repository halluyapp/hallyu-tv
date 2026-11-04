import { StageRail, type RailEntry } from "@/components/stage/StageRail";
import { HeroStage } from "@/components/tv/HeroStage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { APP_NAME } from "@/config/branding";
import { stagger } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList, TabParamList } from "@/navigation/RootNavigator";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import { ProviderError, type HomeSection } from "@/types/provider";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList> & BottomTabNavigationProp<TabParamList, "Home">;
type Open = (detailPath: string, subjectId: string) => void;

/**
 * Mobile home, running on the same stage as the TV: the same hero, the same
 * perspective shelf, the same choreography — sized for the device in your hand
 * instead of the room. One design language, three distances.
 */
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

  // Paint from cache immediately, then revalidate in the background.
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
      .slice(0, 4);
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
    <View style={[styles.root, { paddingTop: insets.top + stage.cardGap }]}>
      <View style={[styles.header, { paddingHorizontal: stage.gutter, marginBottom: stage.cardGap }]}>
        <Text
          style={[
            styles.brand,
            { fontSize: stage.tier === "compact" ? 20 : Math.round(stage.u * 3.6) },
          ]}
        >
          {APP_NAME}
        </Text>
        <Pressable
          style={[
            styles.searchBtn,
            {
              width: stage.controlSize,
              height: stage.controlSize,
              borderRadius: stage.controlSize / 2,
            },
          ]}
          onPress={() => navigation.navigate("Discover")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Search size={Math.round(stage.u * 4.6)} color={palette.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: stage.gutter * 2.4 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
      >
        {error && sections === null ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {sections === null && !error ? <LoadingStage stage={stage} /> : null}
        {empty ? (
          <EmptyState title="Nothing here yet" message="The catalogue is empty right now. Pull to refresh later." />
        ) : null}

        {heroes.length > 0 ? (
          <HeroStage items={heroes} stage={stage} onOpen={(item) => open(item.slug, item.subjectId)} />
        ) : null}

        {resumeEntries.length > 0 ? (
          <StageRail label="Continue watching" entries={resumeEntries} stage={stage} delay={40} />
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
          <StageRail label="Watchlist" entries={watchlistEntries} stage={stage} delay={60 + rails.length * stagger} />
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
    onPress: () => {
      if (row.detail_path) open(row.detail_path, row.subject_id);
    },
  };
}

function toLibraryEntry(item: LibraryTitle, open: Open): RailEntry {
  return {
    key: item.subject_id,
    posterUrl: item.poster_url,
    title: item.title,
    meta: item.media_type === "series" ? "Series" : "Movie",
    progress: null,
    onPress: () => {
      if (item.detail_path) open(item.detail_path, item.subject_id);
    },
  };
}

function sectionLabel(raw: string): string {
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function LoadingStage({ stage }: { stage: Stage }) {
  return (
    <View>
      <View
        style={{
          height: stage.heroHeight,
          marginHorizontal: stage.gutter,
          borderRadius: stage.focusRing * 7,
          backgroundColor: palette.surface,
          opacity: 0.7,
        }}
      />
      {[0, 1].map((row) => (
        <View key={row} style={{ marginTop: stage.rowGap }}>
          <View
            style={{
              height: Math.round(stage.railTitleSize * 0.8),
              width: stage.gutter * 6,
              marginLeft: stage.gutter,
              borderRadius: 4,
              backgroundColor: palette.surfaceRaised,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              gap: stage.cardGap,
              paddingHorizontal: stage.gutter,
              marginTop: stage.cardGap,
            }}
          >
            {[0, 1, 2].map((card) => (
              <View
                key={card}
                style={{
                  width: stage.posterWidth,
                  height: stage.posterHeight,
                  borderRadius: stage.focusRing * 5,
                  backgroundColor: palette.surface,
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: "row", alignItems: "center" },
  brand: {
    flex: 1,
    color: palette.textPrimary,
    fontWeight: "800",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  searchBtn: {
    backgroundColor: palette.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
});
