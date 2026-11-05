import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Play, RotateCcw, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { LegacyFileSystem } from "@/services/downloads/fs";
import { downloadManager } from "@/services/downloads/manager";
import { localFileUri } from "@/services/downloads/paths";
import type { DownloadJob } from "@/services/downloads/types";
import { COMPLETION_THRESHOLD, useLibrary } from "@/state/LibraryContext";
import type { CatalogueItem } from "@/types/provider";
import { formatBytes } from "@/utils/format";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard, GlassProgressBar } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type Nav = NativeStackNavigationProp<TvStackParamList>;

const LEFT_INSET = COLLAPSED_RAIL_WIDTH + 44;

/**
 * 10-foot TV Library Screen powering both 'Continue Watching' and 'My List'.
 */
export function TvLibraryScreen({ mode }: { mode: "continue" | "mylist" }) {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const { watchlist, progress, removeProgress, clearHistory } = useLibrary();

  const continueRows = useMemo(
    () => progress.filter((p) => p.position_seconds > 3),
    [progress],
  );

  const availableWidth = Math.max(480, stage.width - LEFT_INSET - 36);

  if (mode === "continue") {
    const cols = 3;
    const gap = 18;
    const cardWidth = Math.floor((availableWidth - gap * (cols - 1)) / cols);

    return (
      <View style={styles.root}>
        <AmbientArtworkCanvas imageUri={continueRows[0]?.poster_url} intensity="subtle" />
        <FlatList
          data={continueRows}
          numColumns={cols}
          keyExtractor={(r) => `${r.subject_id}-${r.season_number ?? 0}-${r.episode_number ?? 0}`}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={[styles.content, { paddingLeft: LEFT_INSET }]}
          ListHeaderComponent={
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>Continue Watching</Text>
                <Text style={styles.subtitle}>Pick up right where you left off on this TV</Text>
              </View>
              {continueRows.length > 0 ? (
                <GlassPillButton
                  label="Clear Watch History"
                  variant="secondary"
                  size="md"
                  onPress={() => void clearHistory()}
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing in Continue Watching Yet</Text>
              <Text style={styles.emptyBody}>Movies and episodes you start watching appear here automatically.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const pct =
              item.duration_seconds > 0
                ? Math.min(COMPLETION_THRESHOLD, item.position_seconds / item.duration_seconds)
                : 0.2;
            const sub =
              item.media_type === "series"
                ? `S${item.season_number ?? 1} · E${item.episode_number ?? 1}`
                : item.completed
                  ? "Completed"
                  : "Movie";
            return (
              <View style={styles.continueCell}>
                <GlassLandscapeCard
                  title={item.title}
                  subtitle={sub}
                  imageUri={item.poster_url}
                  progress={pct}
                  width={cardWidth}
                  hasTVPreferredFocus={index === 0}
                  onPress={() => {
                    if (!item.detail_path) return;
                    const se = item.media_type === "series" ? (item.season_number ?? 1) : 0;
                    const ep = item.media_type === "series" ? (item.episode_number ?? 1) : 0;
                    navigation.navigate("TvPlayer", {
                      subjectId: item.subject_id,
                      detailPath: item.detail_path,
                      title: item.title,
                      posterUrl: item.poster_url,
                      mediaType: item.media_type,
                      season: se,
                      episode: ep,
                      resumeAt: item.completed ? 0 : item.position_seconds,
                      sources: [],
                      nextEpisode: item.media_type === "series" ? { season: se, episode: ep + 1 } : null,
                    });
                  }}
                />
                <View style={styles.removeRow}>
                  <GlassPillButton
                    label="Remove"
                    size="sm"
                    variant="secondary"
                    onPress={() => void removeProgress(item.subject_id, item.season_number, item.episode_number)}
                  />
                </View>
              </View>
            );
          }}
        />
      </View>
    );
  }

  const cols = 5;
  const gap = 16;
  const posterWidth = Math.floor((availableWidth - gap * (cols - 1)) / cols);
  const mappedWatchlist: CatalogueItem[] = watchlist.map((w) => ({
    name: w.title,
    posterUrl: w.poster_url,
    slug: w.detail_path ?? "",
    subjectId: w.subject_id,
    badge: null,
    rating: null,
    year: null,
    genre: null,
    mediaType: w.media_type,
  }));

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={watchlist[0]?.poster_url} intensity="subtle" />
      <FlatList
        data={mappedWatchlist}
        numColumns={cols}
        keyExtractor={(item) => item.subjectId}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={[styles.content, { paddingLeft: LEFT_INSET }]}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>My List</Text>
              <Text style={styles.subtitle}>{watchlist.length} saved titles on this television</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Your List Is Empty</Text>
            <Text style={styles.emptyBody}>Select + My List on any movie or drama to save it here.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={{ marginBottom: 20 }}>
            <GlassPosterCard
              item={item}
              width={posterWidth}
              hasTVPreferredFocus={index === 0}
              onPress={(selected) => {
                if (!selected.slug) return;
                navigation.navigate("TvDetails", {
                  subjectId: selected.subjectId,
                  detailPath: selected.slug,
                  title: selected.name,
                  posterUrl: selected.posterUrl,
                });
              }}
            />
          </View>
        )}
      />
    </View>
  );
}

/**
 * 10-foot TV Offline Downloads Screen with Liquid Glass Device Storage card.
 */
export function TvDownloadsScreen() {
  const navigation = useNavigation<Nav>();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [freeDisk, setFreeDisk] = useState<number | null>(null);

  useEffect(() => {
    void downloadManager.hydrate();
    const unsub = downloadManager.subscribe(setJobs);
    LegacyFileSystem.freeDiskBytes().then(setFreeDisk).catch(() => {});
    return unsub;
  }, []);

  const offlineUsedBytes = useMemo(
    () =>
      jobs.reduce(
        (acc, j) => acc + (j.state === "completed" ? j.totalBytes ?? j.receivedBytes : j.receivedBytes),
        0,
      ),
    [jobs],
  );

  const storageRatio =
    freeDisk && freeDisk > 0 ? Math.min(1, offlineUsedBytes / (offlineUsedBytes + freeDisk)) : 0.14;

  const playOffline = useCallback(
    (job: DownloadJob) => {
      const resolvedPath =
        job.engine === "native"
          ? localFileUri(job.finalPath)
          : LegacyFileSystem.absolutePathFor(job.finalPath);
      navigation.navigate("TvPlayer", {
        subjectId: job.subjectId,
        detailPath: job.detailPath,
        title: job.title,
        posterUrl: job.posterUrl,
        mediaType: job.mediaType,
        season: job.season,
        episode: job.episode,
        resumeAt: 0,
        sources: [
          {
            ...job.source,
            url: resolvedPath,
          },
        ],
        nextEpisode: null,
      });
    },
    [navigation],
  );

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={jobs[0]?.posterUrl} intensity="subtle" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingLeft: LEFT_INSET }]}
      >
        <Text style={styles.title}>Downloads</Text>
        <Text style={styles.subtitle}>Verified progressive MP4 cinema stored locally for offline playback</Text>

        <LiquidGlassView variant="card" borderRadius={22} style={styles.storageCard} contentStyle={styles.storageInner}>
          <View style={styles.storageRow}>
            <Text style={styles.storageLabel}>TV Offline Storage</Text>
            <Text style={styles.storageMeta}>
              {formatBytes(offlineUsedBytes)} Offline{freeDisk ? ` · ${formatBytes(freeDisk)} Free` : ""}
            </Text>
          </View>
          <GlassProgressBar progress={storageRatio} height={6} />
        </LiquidGlassView>

        {jobs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Offline Downloads Yet</Text>
            <Text style={styles.emptyBody}>Open any movie or series and choose Download MP4 to watch offline.</Text>
          </View>
        ) : (
          <View style={styles.jobsList}>
            {jobs.map((job, idx) => {
              const pct = job.totalBytes && job.totalBytes > 0 ? job.receivedBytes / job.totalBytes : 0;
              return (
                <LiquidGlassView
                  key={job.id}
                  variant="card"
                  borderRadius={20}
                  contentStyle={styles.jobRow}
                >
                  <Poster
                    uri={job.posterUrl}
                    initials={initialsFor(job.title)}
                    style={styles.jobPoster}
                  />
                  <View style={styles.jobInfo}>
                    <Text numberOfLines={1} style={styles.jobTitle}>
                      {job.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.jobSub}>
                      {job.mediaType === "series" ? `Season ${job.season} · Episode ${job.episode} · ` : ""}
                      {job.source.resolution ?? "MP4"} · {job.state.toUpperCase()}
                      {job.totalBytes ? ` · ${formatBytes(job.totalBytes)}` : ""}
                    </Text>
                    {job.failureReason ? <Text style={styles.jobError}>{job.failureReason}</Text> : null}
                    {job.state !== "completed" ? (
                      <GlassProgressBar progress={pct} height={5} style={{ marginTop: 8 }} />
                    ) : null}
                  </View>

                  <View style={styles.jobActions}>
                    {job.state === "completed" ? (
                      <GlassPillButton
                        label="Play Offline"
                        icon={<Play size={15} color={palette.pearlInk} fill={palette.pearlInk} />}
                        variant="primary"
                        size="md"
                        hasTVPreferredFocus={idx === 0}
                        onPress={() => playOffline(job)}
                      />
                    ) : job.state === "failed" || job.state === "paused" || job.state === "waiting_for_network" ? (
                      <GlassPillButton
                        label="Retry"
                        icon={<RotateCcw size={15} color="#FFFFFF" />}
                        variant="secondary"
                        size="md"
                        onPress={() => downloadManager.resume(job.id)}
                      />
                    ) : null}
                    <GlassPillButton
                      label="Delete"
                      icon={<Trash2 size={15} color="#FFFFFF" />}
                      variant="secondary"
                      size="md"
                      onPress={() => void downloadManager.delete(job.id)}
                    />
                  </View>
                </LiquidGlassView>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingTop: 26,
    paddingRight: 32,
    paddingBottom: 56,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  continueCell: {
    marginBottom: 20,
    gap: 8,
  },
  removeRow: {
    flexDirection: "row",
  },
  emptyBox: {
    paddingVertical: 64,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  emptyBody: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 420,
  },
  storageCard: {
    marginBottom: 22,
  },
  storageInner: {
    padding: 18,
    gap: 10,
  },
  storageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storageLabel: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  storageMeta: {
    color: palette.pearlSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  jobsList: {
    gap: 14,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 16,
  },
  jobPoster: {
    width: 68,
    height: 98,
    borderRadius: radius.sm,
  },
  jobInfo: {
    flex: 1,
    gap: 3,
  },
  jobTitle: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  jobSub: {
    color: palette.textSecondary,
    fontSize: 12.5,
  },
  jobError: {
    color: palette.danger,
    fontSize: 12,
    marginTop: 2,
  },
  jobActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
