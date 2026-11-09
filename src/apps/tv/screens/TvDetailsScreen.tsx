import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Check, Download, Film, Play, Plus, Star } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { downloadManager } from "@/services/downloads/manager";
import { fetchAudioVersions, resolveOriginalStreams, resolveStreams } from "@/services/provider/adapter";
import {
  hydrateDetail,
  loadDetailCached,
  peekCachedDetail,
} from "@/services/provider/detailCache";
import { prefetchStreams, takePrefetched } from "@/services/provider/prefetch";
import { selectDownloadSource } from "@/services/provider/streams";
import { COMPLETION_THRESHOLD, useLibrary } from "@/state/LibraryContext";
import type { AudioVersionOption, TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassLandscapeCard } from "@/ui/glass/GlassLandscapeCard";
import { GlassSkeletonBox } from "@/ui/glass/GlassSkeleton";

type Nav = NativeStackNavigationProp<TvStackParamList>;
type DetailRoute = RouteProp<TvStackParamList, "TvDetails">;

/**
 * 1:1 Hallyu TV Widescreen Title Details (`docs/ui-previews/tv-03-details.png`):
 * - Instant 0ms SWR Detail cache + background stream & caption pre-warming
 * - 0ms instant Player navigation on Play / Episode select
 * - Virtualized 16:9 Frosted Liquid Glass Episode Rail with exact `getItemLayout`
 */
export function TvDetailsScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { subjectId, detailPath, title: initialTitle, posterUrl: initialPoster } = route.params;
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor } = useLibrary();

  const [detail, setDetail] = useState<TitleDetail | null>(() => peekCachedDetail(detailPath));
  const [loading, setLoading] = useState(() => !peekCachedDetail(detailPath));
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const episodeListRef = useRef<FlatList<number>>(null);

  const applySeason = useCallback(
    (d: TitleDetail) => {
      const latest = latestFor(d.subjectId);
      if (latest?.season_number && d.seasons.some((s) => s.season === latest.season_number)) {
        setSelectedSeason(latest.season_number);
      } else if (d.seasons[0]) {
        setSelectedSeason(d.seasons[0].season);
      }
    },
    [latestFor],
  );

  const loadTitleDetail = useCallback(async () => {
    setError(null);
    let hadCached = Boolean(peekCachedDetail(detailPath));
    if (!hadCached) {
      const hydrated = await hydrateDetail(detailPath);
      if (hydrated) {
        hadCached = true;
        setDetail(hydrated);
        applySeason(hydrated);
        setLoading(false);
      }
    } else if (detail) {
      applySeason(detail);
    }

    try {
      const fresh = await loadDetailCached(detailPath);
      setDetail(fresh);
      applySeason(fresh);
    } catch {
      if (!hadCached) {
        setError("Could not load details for this title. Check your connection and retry.");
      }
    } finally {
      setLoading(false);
    }
  }, [applySeason, detail, detailPath]);

  useEffect(() => {
    void loadTitleDetail();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const baseId = detail?.subjectId ?? subjectId;
  const baseDetailPath = detail?.detailPath ?? detailPath;
  const effectiveTitle = detail?.title ?? initialTitle;
  const effectivePoster = detail?.posterUrl ?? initialPoster;
  const backdropUri = detail?.backdropUrl ?? effectivePoster;
  const isSeries = detail ? detail.mediaType === "series" && detail.seasons.length > 0 : false;

  const [audioVersions, setAudioVersions] = useState<AudioVersionOption[]>(
    () => detail?.audioVersions ?? [],
  );
  const [selectedAudioVersion, setSelectedAudioVersion] = useState<AudioVersionOption | null>(null);
  const manualVersionRef = useRef(false);

  useEffect(() => {
    if (!detail) return;
    if (detail.audioVersions && detail.audioVersions.length > 0) {
      setAudioVersions(detail.audioVersions);
      if (!manualVersionRef.current) {
        const orig = detail.audioVersions.find((v) => v.isOriginal) ?? detail.audioVersions[0] ?? null;
        setSelectedAudioVersion(orig);
      }
    }
    let cancelled = false;
    fetchAudioVersions({
      subjectId: detail.subjectId,
      detailPath: detail.detailPath,
      title: detail.title,
      mediaType: detail.mediaType,
      country: detail.country,
      existingVersions: detail.audioVersions,
    })
      .then((versions) => {
        if (cancelled || versions.length === 0) return;
        setAudioVersions(versions);
        if (!manualVersionRef.current) {
          const orig = versions.find((v) => v.isOriginal) ?? versions[0] ?? null;
          setSelectedAudioVersion(orig);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const effectiveId = selectedAudioVersion?.subjectId ?? baseId;
  const effectiveDetailPath = selectedAudioVersion?.detailPath ?? baseDetailPath;
  const saved = inWatchlist(effectiveId) || inWatchlist(baseId);
  const latestResume = latestFor(effectiveId) ?? latestFor(baseId);

  const currentSeasonObj = useMemo(
    () => detail?.seasons.find((s) => s.season === selectedSeason) ?? detail?.seasons[0] ?? null,
    [detail?.seasons, selectedSeason],
  );

  // Pre-warm primary Play/Resume stream + captions in the background immediately!
  useEffect(() => {
    if (!detail) return;
    const se = isSeries ? (latestResume?.season_number ?? currentSeasonObj?.season ?? 1) : 0;
    const ep = isSeries ? (latestResume?.episode_number ?? 1) : 0;
    prefetchStreams(effectiveId, effectiveDetailPath, se, ep);
  }, [currentSeasonObj?.season, detail, effectiveDetailPath, effectiveId, isSeries, latestResume]);

  const episodeNumbers = useMemo(() => {
    const count = currentSeasonObj?.maxEp ?? 0;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [currentSeasonObj]);

  // 0ms Instant Player Navigation — opens TvPlayer immediately without button stall
  const startPlayback = useCallback(
    (seasonNum: number, episodeNum: number, resumeSeconds = 0) => {
      setDownloadToast(null);
      const prefetched = takePrefetched(effectiveId, effectiveDetailPath, seasonNum, episodeNum);
      const maxEp = detail?.seasons.find((s) => s.season === seasonNum)?.maxEp ?? 0;
      navigation.navigate("TvPlayer", {
        subjectId: effectiveId,
        detailPath: effectiveDetailPath,
        title: effectiveTitle,
        posterUrl: effectivePoster,
        country: detail?.country ?? null,
        audioVersions,
        mediaType: isSeries ? "series" : "movie",
        season: seasonNum,
        episode: episodeNum,
        maxEpisodesInSeason: maxEp,
        resumeAt: resumeSeconds,
        sources: prefetched?.sources ?? [],
        nextEpisode:
          isSeries && episodeNum < maxEp ? { season: seasonNum, episode: episodeNum + 1 } : null,
      });
    },
    [audioVersions, detail?.country, detail?.seasons, effectiveDetailPath, effectiveId, effectivePoster, effectiveTitle, isSeries, navigation],
  );

  const handlePrimaryPlay = useCallback(() => {
    if (isSeries) {
      const se = latestResume?.season_number ?? currentSeasonObj?.season ?? 1;
      const ep = latestResume?.episode_number ?? 1;
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      startPlayback(se, ep, resumeAt);
    } else {
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      startPlayback(0, 0, resumeAt);
    }
  }, [currentSeasonObj?.season, isSeries, latestResume, startPlayback]);

  const handleWatchTrailer = useCallback(() => {
    if (!detail?.trailerUrl) return;
    navigation.navigate("TvPlayer", {
      subjectId: effectiveId,
      detailPath: effectiveDetailPath,
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
          audioLanguage: null,
          isDubbed: false,
          isHindiDub: false,
          preview: false,
          verifiedFullLength: true,
        },
      ],
      nextEpisode: null,
    });
  }, [detail, effectiveDetailPath, effectiveId, effectivePoster, effectiveTitle, navigation]);

  const handleDownload = useCallback(async () => {
    const se = isSeries ? (latestResume?.season_number ?? selectedSeason) : 0;
    const ep = isSeries ? (latestResume?.episode_number ?? 1) : 0;
    setDownloadToast("Resolving progressive MP4 download…");
    try {
      const res = manualVersionRef.current
        ? await resolveStreams(effectiveId, effectiveDetailPath, se, ep)
        : await resolveOriginalStreams(effectiveId, effectiveDetailPath, se, ep);
      const mp4 =
        selectDownloadSource(res.sources, "720p") ?? selectDownloadSource(res.sources, null);
      if (!mp4) {
        setDownloadToast("No progressive MP4 source available for offline download.");
        return;
      }
      await downloadManager.enqueue({
        subjectId: effectiveId,
        detailPath: effectiveDetailPath,
        title: effectiveTitle,
        posterUrl: effectivePoster,
        mediaType: isSeries ? "series" : "movie",
        season: se,
        episode: ep,
        source: mp4,
        expectedBytes: mp4.sizeBytes,
      });
      setDownloadToast(
        isSeries
          ? `Queued S${se} · E${ep} for offline download.`
          : "Queued movie for offline download.",
      );
    } catch {
      setDownloadToast("Could not queue download. Check your connection and try again.");
    }
  }, [effectiveDetailPath, effectiveId, effectivePoster, effectiveTitle, isSeries, latestResume, selectedSeason]);

  const ratingText = useMemo(() => {
    const n = detail?.rating ? parseFloat(detail.rating) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  }, [detail?.rating]);

  const primaryLabel =
    latestResume && !latestResume.completed
      ? isSeries
        ? `Resume S${latestResume.season_number ?? 1} · E${latestResume.episode_number ?? 1}`
        : "Resume Movie"
      : isSeries
        ? `Play S${currentSeasonObj?.season ?? 1} · E1`
        : "Watch Movie";

  const episodeCardWidth = Math.max(240, Math.min(296, Math.round((stage.width - 80) / 3.9)));

  if (loading && !detail) {
    return (
      <View style={styles.root}>
        <AmbientArtworkCanvas imageUri={initialPoster} intensity="medium" />
        <View style={styles.scrollContent}>
          <GlassPillButton
            label="Back"
            icon={<ArrowLeft size={15} color="#FFFFFF" />}
            variant="secondary"
            size="sm"
            onPress={() => navigation.goBack()}
          />
          <View style={{ marginTop: 26, gap: 14 }}>
            <GlassSkeletonBox width={440} height={46} borderRadius={12} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <GlassSkeletonBox width={110} height={28} borderRadius={999} />
              <GlassSkeletonBox width={70} height={28} borderRadius={999} />
              <GlassSkeletonBox width={80} height={28} borderRadius={999} />
            </View>
            <GlassSkeletonBox width={540} height={64} borderRadius={14} />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              <GlassSkeletonBox width={180} height={48} borderRadius={999} />
              <GlassSkeletonBox width={150} height={48} borderRadius={999} />
              <GlassSkeletonBox width={170} height={48} borderRadius={999} />
            </View>
          </View>
        </View>
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
          <GlassPillButton
            label="Retry"
            variant="primary"
            size="tv"
            hasTVPreferredFocus
            onPress={loadTitleDetail}
          />
          <GlassPillButton
            label="Back"
            variant="secondary"
            size="tv"
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={backdropUri} intensity="rich" />

      {/* Right/Top Widescreen Backdrop Artwork */}
      {backdropUri ? (
        <View
          style={[styles.backdropWrap, { height: Math.round(stage.height * 0.72) }]}
          pointerEvents="none"
        >
          <Poster
            uri={backdropUri}
            initials={initialsFor(effectiveTitle)}
            kind="hero"
            priority="high"
            style={StyleSheet.absoluteFill}
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
                  ? `Series · ${detail?.seasons.length ?? 1} Season${
                      (detail?.seasons.length ?? 1) > 1 ? "s" : ""
                    }`
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
                  {detail.genre
                    .split(",")
                    .slice(0, 2)
                    .map((g) => g.trim())
                    .join(" · ")}
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
              icon={<Play size={16} color="#FFFFFF" fill="#FFFFFF" />}
              variant="primary"
              size="tv"
              hasTVPreferredFocus
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
                  detail_path: effectiveDetailPath,
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

          {audioVersions.length > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 }}>
                AUDIO:
              </Text>
              {audioVersions.map((ver) => {
                const active = ver.subjectId === effectiveId;
                return (
                  <GlassPillButton
                    key={ver.subjectId}
                    label={ver.label}
                    size="sm"
                    variant={active ? "pearl" : "secondary"}
                    active={active}
                    onPress={() => {
                      manualVersionRef.current = true;
                      setSelectedAudioVersion(ver);
                      setDownloadToast(`Audio set to ${ver.label}`);
                    }}
                  />
                );
              })}
            </View>
          ) : null}
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
                    ? `${Math.max(
                        1,
                        Math.round((row.duration_seconds - row.position_seconds) / 60),
                      )}m left`
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
                      prefetchStreams(effectiveId, detailPath, selectedSeason, epNum);
                      episodeListRef.current?.scrollToIndex({
                        index,
                        animated: true,
                        viewPosition: 0.2,
                      });
                    }}
                    onPress={() =>
                      startPlayback(
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
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  errorSub: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 460,
  },
  backdropWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    left: "20%",
  },
  scrollContent: {
    paddingHorizontal: 44,
    paddingTop: 26,
    paddingBottom: 56,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  infoBlock: {
    maxWidth: "60%",
    gap: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 45,
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
    backgroundColor: "rgba(18, 25, 38, 0.75)",
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
    marginTop: 32,
    gap: 16,
  },
  seasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  episodeRail: {
    gap: 16,
    paddingVertical: 8,
    paddingRight: 32,
  },
});
