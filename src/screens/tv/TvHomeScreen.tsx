import { StageRail, type RailEntry } from "@/components/stage/StageRail";
import { HeroStage } from "@/components/tv/HeroStage";
import { TvSpine, type SpineItem } from "@/components/tv/TvSpine";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { stagger } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette, radius } from "@/design-system/tokens";
import { useCatalogue } from "@/hooks/useCatalogue";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Compass, Download, Home as HomeIcon, MonitorSmartphone, Search } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Open = (detailPath: string, subjectId: string) => void;

/**
 * The Stage — the 10-foot home.
 *
 * Renders exactly the shelves the shared catalogue service built, so the TV
 * APK and the phone APK can never disagree about what is trending or what
 * counts as a K-Drama.
 */
export function TvHomeScreen() {
  const stage = useStage();
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();
  const { snapshot, loading, error, refresh } = useCatalogue();

  const open = useCallback<Open>(
    (detailPath, subjectId) => navigation.navigate("Details", { detailPath, subjectId }),
    [navigation],
  );

  const spineItems: SpineItem[] = useMemo(
    () => [
      {
        key: "search",
        label: "Search",
        icon: Search,
        onPress: () => navigation.navigate("TvSearch"),
      },
      {
        key: "home",
        label: "Home",
        icon: HomeIcon,
        onPress: () => {},
      },
      {
        key: "explore",
        label: "Explore",
        icon: Compass,
        onPress: () => navigation.navigate("TvExplore"),
      },
      {
        key: "downloads",
        label: "Downloads",
        icon: Download,
        onPress: () => navigation.navigate("TvDownloads"),
      },
      {
        key: "settings",
        label: "Settings",
        icon: MonitorSmartphone,
        onPress: () => navigation.navigate("TvSettings"),
      },
    ],
    [navigation],
  );

  const heroes = snapshot?.hero ?? [];
  // The wall carries the curated core; Explore carries every world.
  const shelves = (snapshot?.shelves ?? []).slice(0, 18);

  const resume = useMemo(
    () => progress.filter((row) => !row.completed && row.position_seconds > 5).slice(0, 20),
    [progress],
  );

  const resumeEntries = useMemo(() => resume.map((row) => toResumeEntry(row, open)), [resume, open]);
  const watchlistEntries = useMemo(
    () => watchlist.map((item) => toLibraryEntry(item, open)),
    [watchlist, open],
  );

  const empty = !loading && snapshot !== null && heroes.length === 0 && shelves.length === 0;

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <View style={styles.body}>
        <TvSpine items={spineItems} stage={stage} active="home" />

        <ScrollView
          style={styles.wall}
          contentContainerStyle={{ paddingBottom: stage.gutter * 2 }}
          showsVerticalScrollIndicator={false}
        >
          {error && !snapshot ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

          {!snapshot && loading ? <LoadingStage stage={stage} /> : null}

          {empty ? (
            <EmptyState
              title="Nothing on the stage"
              message="The catalogue is empty. Check your connection or retry."
            />
          ) : null}

          {heroes.length > 0 ? (
            <HeroStage items={heroes} stage={stage} onOpen={(item) => open(item.slug, item.subjectId)} />
          ) : null}

          {resumeEntries.length > 0 ? (
            <StageRail
              label="Continue Watching"
              entries={resumeEntries}
              stage={stage}
              delay={40}
              preferredFocus
            />
          ) : null}

          {shelves.map((shelf, index) => (
            <StageRail
              key={shelf.key}
              label={shelf.subtitle ? `${shelf.title} · ${shelf.subtitle}` : shelf.title}
              stage={stage}
              delay={60 + index * stagger}
              preferredFocus={resumeEntries.length === 0 && index === 0}
              onSeeAll={() => navigation.navigate("TvExplore")}
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

function LoadingStage({ stage }: { stage: Stage }) {
  return (
    <View style={{ paddingTop: stage.gutter }}>
      <View
        style={{
          height: stage.heroHeight,
          marginHorizontal: stage.gutter,
          borderRadius: radius.card,
          backgroundColor: palette.glassFillStrong,
          borderColor: palette.glassStroke,
          borderWidth: StyleSheet.hairlineWidth,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  body: { flex: 1, flexDirection: "row" },
  wall: { flex: 1 },
});
