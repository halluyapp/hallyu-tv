import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Check, Download, Film, Play, Plus, Star } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { palette, radius, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { downloadManager } from "@/services/downloads/manager";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { takePrefetched } from "@/services/provider/prefetch";
import { selectDownloadSource } from "@/services/provider/streams";
import { COMPLETION_THRESHOLD, useLibrary } from "@/state/LibraryContext";
import type { TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";

type Nav = NativeStackNavigationProp<TvStackParamList>;
type DetailRoute = RouteProp<TvStackParamList, "TvDetails">;

/**
 * 1:1 Hallyu TV Widescreen Title Details (`docs/ui-previews/tv-03-details.png`):
 * - Right-aligned widescreen cinema backdrop melting seamlessly into smoked glass
 * - Floating frosted glass 'Back' pill at top-left
 * - Bold display title + frosted Liquid Glass metadata pills + 3-line synopsis + Cast
 * - 4 sculpted Liquid Glass CTA capsules: 'Play / Resume Sx·Ex' (default focus),
 *   'In My List', 'Watch Trailer' (when trailerUrl exists), and 'Download MP4'
 * - Horizontal Liquid Glass Season capsules + virtualized 16:9 Frosted Liquid Glass Episode Rail
 */
export function TvDetailsScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { subjectId, detailPath, title: initialTitle, posterUrl: initialPoster } = route.params;
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor } = useLibrary();

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [resolvingPlay, setResolvingPlay] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const episodeListRef = useRef<FlatList<number>>(null);

  const loadTitleDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDetail(detailPath);
      setDetail(d);
      const latest = latestFor(d.subjectId);
      if (latest?.season_number && d.seasons.some((s) => s.season === latest.season_number)) {
        setSelectedSeason(latest.season_number);
      } else if (d.seasons[0]) {
        setSelectedSeason(d.seasons[0].season);
      }
    } catch {
      setError("Could not load details for this title. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [detailPath, latestFor]);

  useEffect(() => {
    void loadTitleDetail();
  }, [loadTitleDetail]);

  const effectiveId = detail?.subjectId ?? subjectId;
  const effectiveTitle = detail?.title ?? initialTitle;
  const effectivePoster = detail?.posterUrl ?? initialPoster;
  const backdropUri = detail?.backdropUrl ?? effectivePoster;
  const isSeries = detail ? detail.mediaType === "series" && detail.seasons.length > 0 : false;
  const saved = inWatchlist(effectiveId);
  const latestResume = latestFor(effectiveId);

  const currentSeasonObj = useMemo(
    () => detail?.seasons.find((s) => s.season === selectedSeason) ?? detail?.seasons[0] ?? null,
    [detail?.seasons, selectedSeason],
  );

  const episodeNumbers = useMemo(() => {
    const count = currentSeasonObj?.maxEp ?? 0;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [currentSeasonObj]);

  const startPlayback = useCallback(
    async (seasonNum: number, episodeNum: number, resumeSeconds = 0) => {
      if (resolvingPlay) return;
      setResolvingPlay(true);
      setDownloadToast(null);
      try {
        const prefetched = takePrefetched(effectiveId, detailPath, seasonNum, episodeNum);
        const res = prefetched ?? (await resolveStreams(effectiveId, detailPath, seasonNum, episodeNum));
        const maxEp = detail?.seasons.find((s) => s.season === seasonNum)?.maxEp ?? 0;
        navigation.navigate("TvPlayer", {
          subjectId: effectiveId,
          detailPath,
          title: effectiveTitle,
          posterUrl: effectivePoster,
          mediaType: isSeries ? "series" : "movie",
          season: seasonNum,
          episode: episodeNum,
          maxEpisodesInSeason: maxEp,
          resumeAt: resumeSeconds,
          sources: res.sources,
          nextEpisode: isSeries && episodeNum < maxEp ? { season: seasonNum, episode: episodeNum + 1 } : null,
        });
      } catch (err) {
        setDownloadToast(err instanceof Error ? err.message : "No playable stream is available right now.");
      } finally {
        setResolvingPlay(false);
      }
    },
    [detail?.seasons, detailPath, effectiveId, effectivePoster, effectiveTitle, isSeries, navigation, resolvingPlay],
  );

  const handlePrimaryPlay = useCallback(() => {
    if (isSeries) {
      const se = latestResume?.season_number ?? currentSeasonObj?.season ?? 1;
      const ep = latestResume?.episode_number ?? 1;
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      void startPlayback(se, ep, resumeAt);
    } else {
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      void startPlayback(0, 0, resumeAt);
    }
  }, [currentSeasonObj?.season, isSeries, latestResume, startPlayback]);

  const handleWatchTrailer = useCallback(() => {
    if (!detail?.trailerUrl) return;
    navigation.navigate("TvPlayer", {
      subjectId: effectiveId,
      detailPath,
      title: `${effectiveTitle} · Trailer`,
      posterUrl: effectivePoster,
      mediaType: detail.mediaType,
      season: 0,
      episode: 0,
      resumeAt: 0,
      isTrailer: true,
      sources: [
        {
          url: detail.trailerUrl,
          resolution: "Trailer",
          qualityValue: 720,
          format: "MP4",
          codec: null,
          sizeBytes: null,
          durationSeconds: null,
          sourceLabel: "Trailer",
          preview: false,
          verifiedFullLength: true,
        },
      ],
      nextEpisode: null,
    });
  }, [detail, detailPath, effectiveId, effectivePoster, effectiveTitle, navigation]);

  const handleDownload = useCallback(async () => {
    const se = isSeries ? (latestResume?.season_number ?? selectedSeason) : 0;
    const ep = isSeries ? (latestResume?.episode_number ?? 1) : 0;
    setDownloadToast("Resolving progressive MP4 download…");
    try {
      const res = await resolveStreams(effectiveId, detailPath, se, ep);
      const mp4 = selectDownloadSource(res.sources, "720p") ?? selectDownloadSource(res.sources, null);
      if (!mp4) {
        setDownloadToast("No progressive MP4 source available for offline download.");
        return;
      }
      await downloadManager.enqueue({
        subjectId: effectiveId,
        detailPath,
        title: effectiveTitle,
        posterUrl: effectivePoster,
        mediaType: isSeries ? "series" : "movie",
        season: se,
        episode: ep,
        source: mp4,
        expectedBytes: mp4.sizeBytes,
      });
      setDownloadToast(
        isSeries ? `Queued S${se} · E${ep} for offline download.` : "Queued movie for offline download.",
      );
    } catch {
      setDownloadToast("Could not queue download. Check your connection and try again.");
    }
  }, [detailPath, effectiveId, effectivePoster, effectiveTitle, isSeries, latestResume, selectedSeason]);

  const ratingText = useMemo(() => {
    const n = detail?.rating ? parseFloat(detail.rating) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  }, [detail?.rating]);

  const primaryLabel = resolvingPlay
    ? "Preparing Stream…"
    : latestResume && !latestResume.completed
      ? isSeries
        ? `Resume S${latestResume.season_number ?? 1} · E${latestResume.episode_number ?? 1}`
        : "Resume Movie"
      : isSeries
        ? `Play S${currentSeasonObj?.season ?? 1} · E1`
        : "Watch Movie";

  const episodeCardWidth = Math.max(240, Math.min(296, Math.round((stage.width - 80) / 3.9)));

  if (loading && !detail) {
    return (
      <View style={styles.center}>
        <AmbientArtworkCanvas imageUri={initialPoster} intensity="medium" />
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading {initialTitle}…</Text>
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.center}>
        <AmbientArtworkCanvas imageUri={initialPoster} intensity="subtle" />
        <Text style={styles.errorTitle}>Unable to Open Title</Text>
        <Text style={styles.errorSub}>{error}</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <GlassPillButton label="Retry" variant="primary" size="tv" hasTVPreferredFocus onPress={loadTitleDetail} />
          <GlassPillButton label="Back" variant="secondary" size="tv" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={backdropUri} intensity="rich" />

      {/* Right/Top Widescreen Backdrop Artwork */}
      {backdropUri ? (
        <View style={[styles.backdropWrap, { height: Math.round(stage.height * 0.72) }]} pointerEvents="none">
          <ExpoImage
            source={{ uri: backdropUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={profile.imageTransitionMs}
          />
          <LinearGradient
            colors={["#05080E", "rgba(5, 8, 14, 0.82)", "rgba(5, 8, 14, 0.14)"]}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["rgba(5, 8, 14, 0.12)", "rgba(5, 8, 14, 0.68)", "#05080E"]}
            locations={[0, 0.68, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Floating Frosted Glass Back Pill */}
        <View style={styles.topRow}>
          <GlassPillButton
            label="Back"
            icon={<ArrowLeft size={15} color="#FFFFFF" />}
            variant="secondary"
            size="sm"
            onPress={() => navigation.goBack()}
          />
        </View>

        {/* Widescreen Metadata & Liquid Glass Actions */}
        <View style={styles.infoBlock}>
          <Text numberOfLines={2} style={styles.title}>
            {effectiveTitle.toUpperCase()}
          </Text>

          <View style={styles.metaPills}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {isSeries
                  ? `Series · ${detail?.seasons.length ?? 1} Season${(detail?.seasons.length ?? 1) > 1 ? "s" : ""}`
                  : "Movie"}
              </Text>
            </View>
            {ratingText ? (
              <View style={styles.metaPill}>
                <Star size={12} color={palette.gold} fill={palette.gold} />
                <Text style={[styles.metaPillText, { color: "#FFF7E0" }]}>{ratingText}</Text>
              </View>
            ) : null}
            {detail?.releaseDate ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>{detail.releaseDate.slice(0, 4)}</Text>
              </View>
            ) : null}
            {detail?.country ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>{detail.country}</Text>
              </View>
            ) : null}
            {detail?.genre ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>
                  {detail.genre.split(",").slice(0, 2).map((g) => g.trim()).join(" · ")}
                </Text>
              </View>
            ) : null}
          </View>

          {detail?.description ? (
            <Text numberOfLines={3} style={styles.synopsis}>
              {detail.description}
            </Text>
          ) : null}

          {detail && detail.cast.length > 0 ? (
            <Text numberOfLines={1} style={styles.castLine}>
              Cast: {detail.cast.slice(0, 5).map((c) => c.name).join(", ")}
            </Text>
          ) : null}

          {/* 4 Sculpted Liquid Glass CTA Capsules */}
          <View style={styles.ctaRow}>
            <GlassPillButton
              label={primaryLabel}
              icon={<Play size={16} color={palette.pearlInk} fill={palette.pearlInk} />}
              variant="primary"
              size="tv"
              hasTVPreferredFocus
              disabled={resolvingPlay}
              onPress={handlePrimaryPlay}
            />
            <GlassPillButton
              label={saved ? "In My List" : "+ My List"}
              icon={saved ? <Check size={16} color="#FFFFFF" /> : <Plus size={16} color="#FFFFFF" />}
              variant="secondary"
              size="tv"
              onPress={() =>
                void toggleWatchlist({
                  subject_id: effectiveId,
                  detail_path: detailPath,
                  media_type: isSeries ? "series" : "movie",
                  title: effectiveTitle,
                  poster_url: effectivePoster,
                })
              }
            />
            {detail?.trailerUrl ? (
              <GlassPillButton
                label="Watch Trailer"
                icon={<Film size={16} color="#FFFFFF" />}
                variant="secondary"
                size="tv"
                onPress={handleWatchTrailer}
              />
            ) : null}
            <GlassPillButton
              label="Download MP4"
              icon={<Download size={16} color="#FFFFFF" />}
              variant="secondary"
              size="tv"
              onPress={handleDownload}
            />
          </View>

          {downloadToast ? <Text style={styles.toastText}>{downloadToast}</Text> : null}
        </View>

        {/* Horizontal Season Capsules + 16:9 Frosted Liquid Glass Episode Cards */}
        {isSeries && detail ? (
          <View style={styles.episodesSection}>
            <View style={styles.seasonRow}>
              {detail.seasons.map((s) => (
                <GlassPillButton
                  key={s.season}
                  label={`Season ${s.season}`}
                  variant={selectedSeason === s.season ? "pearl" : "secondary"}
                  active={selectedSeason === s.season}
                  size="md"
                  onPress={() => {
                    setSelectedSeason(s.season);
                    episodeListRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }}
                />
              ))}
            </View>

            <FlatList
              ref={episodeListRef}
              horizontal
              data={episodeNumbers}
              keyExtractor={(ep) => `s${selectedSeason}-e${ep}`}
              showsHorizontalScrollIndicator={false}
              windowSize={profile.listWindowSize}
              maxToRenderPerBatch={profile.maxToRenderPerBatch}
              initialNumToRender={5}
              removeClippedSubviews
              contentContainerStyle={styles.episodeRail}
              getItemLayout={(_, index) => ({
                length: episodeCardWidth + 16,
                offset: (episodeCardWidth + 16) * index,
                index,
              })}
              renderItem={({ item: epNum, index }) => {
                const row = resumeFor(effectiveId, selectedSeason, epNum);
                const pct =
                  row && row.duration_seconds > 0
                    ? Math.min(1, row.position_seconds / row.duration_seconds)
                    : row
                      ? 0.2
                      : 0;
                const statusLabel = row?.completed
                  ? "Watched"
                  : row && row.position_seconds > 10
                    ? `${Math.max(1, Math.round((row.duration_seconds - row.position_seconds) / 60))}m left`
                    : "HD";
                return (
                  <GlassLandscapeCard
                    title={`E${epNum} · ${effectiveTitle}`}
                    subtitle={`Season ${selectedSeason} · Episode ${epNum}`}
                    rightMeta={statusLabel}
                    imageUri={backdropUri}
                    progress={pct >= COMPLETION_THRESHOLD ? 1 : pct}
                    width={episodeCardWidth}
                    onFocusCard={() => {
                      episodeListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
                    }}
                    onPress={() =>
                      void startPlayback(
                        selectedSeason,
                        epNum,
                        row && !row.completed ? row.position_seconds : 0,
                      )
                    }
                  />
                );
              }}
              onScrollToIndexFailed={() => {}}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  center: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: 14,
  },
  loadingText: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  errorTitle: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  errorSub: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 460,
    marginBottom: 8,
  },
  backdropWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    left: "22%",
  },
  scrollContent: {
    paddingHorizontal: 42,
    paddingTop: 22,
    paddingBottom: 48,
  },
  topRow: {
    flexDirection: "row",
    marginBottom: 22,
  },
  infoBlock: {
    maxWidth: "62%",
    gap: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
    lineHeight: 43,
  },
  metaPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  metaPill: {
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
  metaPillText: {
    color: "#F3F6FA",
    fontSize: 12,
    fontWeight: "700",
  },
  synopsis: {
    color: palette.textSecondary,
    fontSize: 14.5,
    lineHeight: 22,
  },
  castLine: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  toastText: {
    color: palette.pearlSoft,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  episodesSection: {
    marginTop: 28,
    gap: 14,
  },
  seasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  episodeRail: {
    gap: 16,
    paddingVertical: 8,
    paddingRight: 28,
  },
});
