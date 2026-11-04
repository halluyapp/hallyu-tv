import { StageRail, type RailEntry } from "@/components/stage/StageRail";
import { HeroStage } from "@/components/tv/HeroStage";
import { TvSpine, type SpineItem } from "@/components/tv/TvSpine";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { stagger } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import { ProviderError, type HomeSection } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Download, Home as HomeIcon, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Open = (detailPath: string, subjectId: string) => void;

/**
 * The Stage — the 10-foot home.
 *
 * Everything here is measured from `useStage()`, so a 55" panel driven by an
 * Android box gets television proportions instead of a phone layout stretched
 * over glass. The spine carries identity; the wall carries the catalogue.
 */
export function TvHomeScreen() {
  const stage = useStage();
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();

  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSections(await loadHome());
    } catch (err) {
      setLoadError(err instanceof ProviderError ? err.message : "The catalogue could not be loaded.");
    }
  }, []);

  // Instant paint from the last known catalogue, then revalidate.
  useEffect(() => {
    let mounted = true;
    void hydrateHome().then((cached) => {
      if (mounted && cached) setSections(cached);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void load();
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
  const watchlistEntries = useMemo(
    () => watchlist.map((item) => toLibraryEntry(item, open)),
    [watchlist, open],
  );

  const spineItems = useMemo<SpineItem[]>(
    () => [
      { key: "home", label: "Home", icon: HomeIcon, onPress: () => {} },
      { key: "search", label: "Search", icon: Search, onPress: () => navigation.navigate("TvSearch") },
      { key: "downloads", label: "Downloads", icon: Download, onPress: () => navigation.navigate("TvDownloads") },
    ],
    [navigation],
  );

  const empty = sections !== null && heroes.length === 0 && rails.length === 0;

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <TvSpine stage={stage} items={spineItems} active="home" />

        <ScrollView
          style={styles.wall}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: stage.gutter * 0.8,
            paddingBottom: stage.gutter * 2,
          }}
        >
          {loadError && sections === null ? (
            <ErrorState message={loadError} onRetry={() => void load()} />
          ) : null}

          {sections === null && !loadError ? <LoadingStage stage={stage} /> : null}

          {empty ? (
            <EmptyState title="Nothing here yet" message="The catalogue is empty right now. Try again in a moment." />
          ) : null}

          {heroes.length > 0 ? (
            <HeroStage items={heroes} stage={stage} onOpen={(item) => open(item.slug, item.subjectId)} />
          ) : null}

          {resumeEntries.length > 0 ? (
            <StageRail label="Continue watching" entries={resumeEntries} stage={stage} delay={40} preferredFocus />
          ) : null}

          {rails.map((section, index) => (
            <StageRail
              key={section.section}
              label={sectionLabel(section.section)}
              stage={stage}
              delay={60 + index * stagger}
              preferredFocus={resumeEntries.length === 0 && index === 0}
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
            <StageRail
              label="Watchlist"
              entries={watchlistEntries}
              stage={stage}
              delay={60 + rails.length * stagger}
            />
          ) : null}
        </ScrollView>
      </View>
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
      {[0, 1, 2].map((row) => (
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
            {[0, 1, 2, 3, 4].map((card) => (
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
      <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, marginLeft: stage.gutter, marginTop: stage.rowGap }}>
        Laying the stage…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  body: { flex: 1, flexDirection: "row" },
  wall: { flex: 1 },
});
