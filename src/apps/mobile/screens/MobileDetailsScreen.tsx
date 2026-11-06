import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Download,
  Info,
  Play,
  Star,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileStackParamList } from "@/apps/mobile/navigation/mobileTypes";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { downloadManager } from "@/services/downloads/manager";
import { downloadKey } from "@/services/downloads/reasons";
import type { DownloadJob } from "@/services/downloads/types";
import { resolveStreams } from "@/services/provider/adapter";
import {
  hydrateDetail,
  loadDetailCached,
  peekCachedDetail,
} from "@/services/provider/detailCache";
import { prefetchStreams, takePrefetched } from "@/services/provider/prefetch";
import { selectDownloadSource } from "@/services/provider/streams";
import { useSound } from "@/services/sound/SoundContext";
import { COMPLETION_THRESHOLD, useLibrary } from "@/state/LibraryContext";
import type { TitleDetail } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassIconButton, GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassProgressBar } from "@/ui/glass/GlassLandscapeCard";
import { GlassSkeletonBox } from "@/ui/glass/GlassSkeleton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type Nav = NativeStackNavigationProp<MobileStackParamList>;
type DetailRoute = RouteProp<MobileStackParamList, "MobileDetails">;

const EPISODE_ROW_HEIGHT = 86;
const EPISODE_ROW_GAP = 11;

/**
 * 1:1 Hallyu Mobile Title Details (`docs/ui-previews/mobile-03-details.png`):
 * - Instant 0ms SWR Detail hydration + background stream/subtitle pre-warming
 * - 0ms instant Player navigation on Watch Now / Episode tap
 * - Fixed-height `getItemLayout` episode virtualization for locked 60fps flings
 */
export function MobileDetailsScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const profile = usePerformanceProfile();
  const { play } = useSound();
  const { subjectId, detailPath, title: initialTitle, posterUrl: initialPoster } = route.params;
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor } = useLibrary();

  const [detail, setDetail] = useState<TitleDetail | null>(() => peekCachedDetail(detailPath));
  const [loading, setLoading] = useState(() => !peekCachedDetail(detailPath));
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    void downloadManager.hydrate();
    return downloadManager.subscribe(setDownloadJobs);
  }, []);

  useEffect(
    () => () => {
      try {
        Speech.stop();
      } catch {}
    },
    [],
  );

  const applyInitialSeason = useCallback(
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

  const loadDetail = useCallback(async () => {
    setError(null);
    let hadCached = Boolean(peekCachedDetail(detailPath));
    if (!hadCached) {
      const hydrated = await hydrateDetail(detailPath);
      if (hydrated) {
        hadCached = true;
        setDetail(hydrated);
        applyInitialSeason(hydrated);
        setLoading(false);
      }
    } else if (detail) {
      applyInitialSeason(detail);
    }

    try {
      const fresh = await loadDetailCached(detailPath);
      setDetail(fresh);
      applyInitialSeason(fresh);
    } catch {
      if (!hadCached) {
        setError("Could not load details right now. Check your connection and retry.");
      }
    } finally {
      setLoading(false);
    }
  }, [applyInitialSeason, detail, detailPath]);

  useEffect(() => {
    void loadDetail();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveId = detail?.subjectId ?? subjectId;
  const effectiveTitle = detail?.title ?? initialTitle;
  const effectivePoster = detail?.posterUrl ?? initialPoster;
  const heroArt = effectivePoster ?? detail?.backdropUrl ?? null;
  const isSeries = detail ? detail.mediaType === "series" && detail.seasons.length > 0 : false;
  const saved = inWatchlist(effectiveId);
  const latestResume = latestFor(effectiveId);

  const currentSeasonObj = useMemo(
    () => detail?.seasons.find((s) => s.season === selectedSeason) ?? detail?.seasons[0] ?? null,
    [detail?.seasons, selectedSeason],
  );

  // Silently pre-warm primary Play/Resume stream + subtitles as soon as Details opens!
  useEffect(() => {
    if (!detail) return;
    const se = isSeries ? (latestResume?.season_number ?? currentSeasonObj?.season ?? 1) : 0;
    const ep = isSeries ? (latestResume?.episode_number ?? 1) : 0;
    prefetchStreams(effectiveId, detailPath, se, ep);
  }, [currentSeasonObj?.season, detail, detailPath, effectiveId, isSeries, latestResume]);

  const episodeNumbers = useMemo(() => {
    const count = currentSeasonObj?.maxEp ?? 0;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [currentSeasonObj]);

  const jobsByKey = useMemo(() => {
    const map = new Map<string, DownloadJob>();
    for (const j of downloadJobs) {
      map.set(j.id, j);
    }
    return map;
  }, [downloadJobs]);

  // 0ms Instant Player Navigation — opens MobilePlayer immediately without button stall
  const openPlayback = useCallback(
    (se: number, ep: number, resumeSeconds = 0) => {
      setToast(null);
      const prefetched = takePrefetched(effectiveId, detailPath, se, ep);
      const maxEp = detail?.seasons.find((s) => s.season === se)?.maxEp ?? 0;
      navigation.navigate("MobilePlayer", {
        subjectId: effectiveId,
        detailPath,
        title: effectiveTitle,
        posterUrl: effectivePoster,
        mediaType: isSeries ? "series" : "movie",
        season: se,
        episode: ep,
        maxEpisodesInSeason: maxEp,
        resumeAt: resumeSeconds,
        sources: prefetched?.sources ?? [],
        nextEpisode: isSeries && ep < maxEp ? { season: se, episode: ep + 1 } : null,
      });
    },
    [detail?.seasons, detailPath, effectiveId, effectivePoster, effectiveTitle, isSeries, navigation],
  );

  const handlePrimaryPlay = useCallback(() => {
    if (isSeries) {
      const se = latestResume?.season_number ?? currentSeasonObj?.season ?? 1;
      const ep = latestResume?.episode_number ?? 1;
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      openPlayback(se, ep, resumeAt);
    } else {
      const resumeAt = latestResume && !latestResume.completed ? latestResume.position_seconds : 0;
      openPlayback(0, 0, resumeAt);
    }
  }, [currentSeasonObj?.season, isSeries, latestResume, openPlayback]);

  const handleQueueDownload = useCallback(
    async (se: number, ep: number) => {
      setToast("Resolving progressive MP4…");
      try {
        const res = await resolveStreams(effectiveId, detailPath, se, ep);
        const mp4 = selectDownloadSource(res.sources, null);
        if (!mp4) {
          setToast("No progressive MP4 available for offline saving.");
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
        setToast(isSeries ? `Downloading S${se} · E${ep}` : "Downloading movie for offline viewing");
      } catch {
        setToast("Could not start download. Check your network and try again.");
      }
    },
    [detailPath, effectiveId, effectivePoster, effectiveTitle, isSeries],
  );

  const handleSpeakSynopsis = useCallback(() => {
    if (!detail?.description) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(`${effectiveTitle}. ${detail.description}`, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [detail?.description, effectiveTitle, speaking]);

  const handleWatchTrailer = useCallback(() => {
    if (!detail?.trailerUrl) {
      setToast("No trailer stream was provided for this title.");
      return;
    }
    navigation.navigate("MobilePlayer", {
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

  const ratingText = useMemo(() => {
    const n = detail?.rating ? parseFloat(detail.rating) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  }, [detail?.rating]);

  const primaryCtaText =
    latestResume && !latestResume.completed
      ? isSeries
        ? `Resume S${latestResume.season_number ?? 1} · E${latestResume.episode_number ?? 1}`
        : "Resume Movie"
      : isSeries
        ? `Play S${currentSeasonObj?.season ?? 1} · E1`
        : "Watch Now";

  if (loading && !detail) {
    return (
      <View style={styles.root}>
        <AmbientArtworkCanvas imageUri={initialPoster} intensity="rich" />
        <View style={styles.posterHero}>
          {initialPoster ? (
            <ExpoImage
              source={{ uri: initialPoster }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
          <LinearGradient
            colors={["rgba(5, 8, 14, 0.25)", "rgba(5, 8, 14, 0.65)", "#05080E"]}
            locations={[0, 0.62, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.cornerBar, { top: insets.top + 10 }]}>
            <GlassIconButton
              icon={<ArrowLeft size={20} color="#FFFFFF" />}
              accessibilityLabel="Back"
              size={44}
              onPress={() => navigation.goBack()}
            />
          </View>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.displayTitle}>{initialTitle.toUpperCase()}</Text>
          </View>
        </View>
        <View style={[styles.bodyPad, { marginTop: 8 }]}>
          <GlassSkeletonBox width="100%" height={48} borderRadius={999} />
          <View style={styles.fourActionsRow}>
            {[0, 1, 2, 3].map((k) => (
              <GlassSkeletonBox key={k} height={42} borderRadius={999} style={{ flex: 1 }} />
            ))}
          </View>
          <GlassSkeletonBox width="100%" height={60} borderRadius={16} />
          {[0, 1, 2].map((r) => (
            <GlassSkeletonBox key={r} width="100%" height={84} borderRadius={20} />
          ))}
        </View>
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.center}>
        <AmbientArtworkCanvas imageUri={initialPoster} intensity="subtle" />
        <Text style={styles.errorTitle}>Unable to Open Title</Text>
        <Text style={styles.stateText}>{error}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <GlassPillButton label="Retry" variant="primary" onPress={loadDetail} />
          <GlassPillButton label="Back" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={heroArt} intensity="rich" />

      <FlatList
        data={isSeries ? episodeNumbers : []}
        keyExtractor={(ep) => `s${selectedSeason}-e${ep}`}
        showsVerticalScrollIndicator={false}
        windowSize={profile.listWindowSize}
        maxToRenderPerBatch={profile.maxToRenderPerBatch}
        initialNumToRender={6}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: EPISODE_ROW_HEIGHT + EPISODE_ROW_GAP,
          offset: (EPISODE_ROW_HEIGHT + EPISODE_ROW_GAP) * index,
          index,
        })}
        contentContainerStyle={{ paddingBottom: Math.max(28, insets.bottom + 20) }}
        ListHeaderComponent={
          <View>
            {/* Top Edge-to-Edge Poster Backdrop */}
            <View style={styles.posterHero}>
              {heroArt ? (
                <ExpoImage
                  source={{ uri: heroArt }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={profile.imageTransitionMs}
                />
              ) : null}
              <LinearGradient
                colors={["rgba(5, 8, 14, 0.25)", "rgba(5, 8, 14, 0.65)", "#05080E"]}
                locations={[0, 0.62, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* Floating Circular Frosted Liquid Glass Corner Buttons */}
              <View style={[styles.cornerBar, { top: insets.top + 10 }]}>
                <GlassIconButton
                  icon={<ArrowLeft size={20} color="#FFFFFF" />}
                  accessibilityLabel="Back"
                  size={44}
                  onPress={() => navigation.goBack()}
                />
                {detail?.description ? (
                  <GlassIconButton
                    icon={
                      speaking ? (
                        <VolumeX size={20} color={palette.pearlInk} />
                      ) : (
                        <Volume2 size={20} color="#FFFFFF" />
                      )
                    }
                    accessibilityLabel="Listen to audio synopsis"
                    active={speaking}
                    size={44}
                    onPress={handleSpeakSynopsis}
                  />
                ) : null}
              </View>

              <View style={styles.heroTitleBlock}>
                <Text style={styles.displayTitle}>{effectiveTitle.toUpperCase()}</Text>
                <View style={styles.metaChipsRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{isSeries ? "Series" : "Movie"}</Text>
                  </View>
                  {ratingText ? (
                    <View style={styles.metaChip}>
                      <Star size={11} color={palette.gold} fill={palette.gold} />
                      <Text style={[styles.metaChipText, { color: "#FFF7E0" }]}>{ratingText}</Text>
                    </View>
                  ) : null}
                  {detail?.releaseDate ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{detail.releaseDate.slice(0, 4)}</Text>
                    </View>
                  ) : null}
                  {isSeries && currentSeasonObj ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{currentSeasonObj.maxEp} Eps</Text>
                    </View>
                  ) : null}
                  {detail?.country ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{detail.country}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Primary CTA + 4 Action Pills + Synopsis + Segmented Season Bar */}
            <View style={styles.bodyPad}>
              <GlassPillButton
                label={primaryCtaText}
                variant="primary"
                size="lg"
                fullWidth
                onPress={handlePrimaryPlay}
              />

              {/* 4 Sculpted Frosted Liquid Glass Action Pills */}
              <View style={styles.fourActionsRow}>
                <ActionTile
                  icon={
                    saved ? (
                      <Check size={18} color="#FFFFFF" />
                    ) : (
                      <Bookmark size={18} color="#FFFFFF" />
                    )
                  }
                  label={saved ? "Saved" : "My List"}
                  onPress={() => {
                    play("confirm", { intensity: 0.4 });
                    void toggleWatchlist({
                      subject_id: effectiveId,
                      detail_path: detailPath,
                      media_type: isSeries ? "series" : "movie",
                      title: effectiveTitle,
                      poster_url: effectivePoster,
                    });
                  }}
                />
                <ActionTile
                  icon={<Play size={18} color="#FFFFFF" fill="#FFFFFF" />}
                  label="Trailer"
                  onPress={handleWatchTrailer}
                />
                <ActionTile
                  icon={<Download size={18} color="#FFFFFF" />}
                  label="Download"
                  onPress={() =>
                    void handleQueueDownload(
                      isSeries ? (latestResume?.season_number ?? selectedSeason) : 0,
                      isSeries ? (latestResume?.episode_number ?? 1) : 0,
                    )
                  }
                />
                <ActionTile
                  icon={<Info size={18} color="#FFFFFF" />}
                  label="Synopsis"
                  onPress={() => setSynopsisExpanded((v) => !v)}
                />
              </View>

              {toast ? <Text style={styles.toastText}>{toast}</Text> : null}

              {detail?.description ? (
                <Pressable onPress={() => setSynopsisExpanded((v) => !v)}>
                  <Text numberOfLines={synopsisExpanded ? undefined : 3} style={styles.synopsis}>
                    {detail.description}
                    {detail.genre ? ` (${detail.genre})` : ""}
                  </Text>
                </Pressable>
              ) : null}

              {synopsisExpanded && detail && detail.cast.length > 0 ? (
                <Text style={styles.castText}>
                  Cast: {detail.cast.slice(0, 6).map((c) => c.name).join(", ")}
                </Text>
              ) : null}

              {/* Segmented Liquid Glass Season Bar */}
              {isSeries && detail && detail.seasons.length > 0 ? (
                <View style={styles.seasonSection}>
                  {detail.seasons.length <= 3 ? (
                    <LiquidGlassView
                      variant="card"
                      borderRadius={radius.pill}
                      contentStyle={styles.segmentedBar}
                    >
                      {detail.seasons.map((s) => {
                        const active = selectedSeason === s.season;
                        return (
                          <Pressable
                            key={s.season}
                            onPress={() => {
                              play("tab", { intensity: 0.35 });
                              setSelectedSeason(s.season);
                            }}
                            style={[styles.segmentSlot, active && styles.segmentSlotActive]}
                          >
                            <Text
                              style={[styles.segmentLabel, active && styles.segmentLabelActive]}
                            >
                              Season {s.season}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </LiquidGlassView>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {detail.seasons.map((s) => (
                        <GlassPillButton
                          key={s.season}
                          label={`Season ${s.season}`}
                          size="sm"
                          variant={selectedSeason === s.season ? "pearl" : "secondary"}
                          active={selectedSeason === s.season}
                          onPress={() => setSelectedSeason(s.season)}
                        />
                      ))}
                    </ScrollView>
                  )}

                  <Text style={styles.episodesHeading}>Episodes</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item: epNum }) => {
          const row = resumeFor(effectiveId, selectedSeason, epNum);
          const pct =
            row && row.duration_seconds > 0
              ? Math.min(1, row.position_seconds / row.duration_seconds)
              : row
                ? 0.2
                : 0;
          const dlKey = downloadKey(effectiveId, selectedSeason, epNum);
          const job = jobsByKey.get(dlKey);

          return (
            <MobileEpisodeRow
              episodeNumber={epNum}
              seasonNumber={selectedSeason}
              title={effectiveTitle}
              thumbUri={detail?.backdropUrl ?? effectivePoster}
              progress={pct >= COMPLETION_THRESHOLD ? 1 : pct}
              downloadState={job?.state ?? null}
              onPlay={() =>
                openPlayback(
                  selectedSeason,
                  epNum,
                  row && !row.completed ? row.position_seconds : 0,
                )
              }
              onDownload={() => void handleQueueDownload(selectedSeason, epNum)}
            />
          );
        }}
      />
    </View>
  );
}

const ActionTile = memo(function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionSlot}>
      <LiquidGlassView variant="card" borderRadius={radius.pill} contentStyle={styles.actionPillInner}>
        {icon}
      </LiquidGlassView>
      <Text numberOfLines={1} style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
});

const MobileEpisodeRow = memo(function MobileEpisodeRow({
  episodeNumber,
  seasonNumber,
  title,
  thumbUri,
  progress,
  downloadState,
  onPlay,
  onDownload,
}: {
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  thumbUri: string | null | undefined;
  progress: number;
  downloadState: string | null;
  onPlay: () => void;
  onDownload: () => void;
}) {
  return (
    <View style={styles.epOuterPad}>
      <Pressable onPress={onPlay}>
        <LiquidGlassView variant="card" borderRadius={20} contentStyle={styles.epCardInner}>
          <View style={styles.epThumbWrap}>
            <Poster uri={thumbUri} initials={initialsFor(title)} style={StyleSheet.absoluteFill} />
            <View style={styles.epNumberBadge}>
              <Text style={styles.epNumberText}>E{episodeNumber}</Text>
            </View>
          </View>

          <View style={styles.epCenter}>
            <Text style={styles.epCode}>E{episodeNumber}</Text>
            <Text numberOfLines={1} style={styles.epTitle}>
              Season {seasonNumber} · Episode {episodeNumber}
            </Text>
            <GlassProgressBar progress={progress} height={4} style={{ marginTop: 6 }} />
          </View>

          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Download episode ${episodeNumber}`}
            onPress={onDownload}
            style={styles.epDlCircle}
          >
            {downloadState === "completed" ? (
              <Check size={16} color={palette.success} />
            ) : downloadState === "downloading" ||
              downloadState === "queued" ||
              downloadState === "resolving" ? (
              <ActivityIndicator size="small" color={palette.accentBright} />
            ) : (
              <Download size={16} color="#FFFFFF" />
            )}
          </Pressable>
        </LiquidGlassView>
      </Pressable>
    </View>
  );
});

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
    padding: 28,
    gap: 12,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },
  stateText: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
  },
  posterHero: {
    height: 365,
    justifyContent: "flex-end",
    position: "relative",
  },
  cornerBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitleBlock: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    alignItems: "center",
    gap: 10,
  },
  displayTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    textAlign: "center",
    lineHeight: 33,
  },
  metaChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(18, 25, 38, 0.76)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  metaChipText: {
    color: "#F3F6FA",
    fontSize: 11.5,
    fontWeight: "700",
  },
  bodyPad: {
    paddingHorizontal: 18,
    gap: 15,
  },
  fourActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  actionSlot: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  actionPillInner: {
    width: "100%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: "600",
  },
  toastText: {
    color: palette.pearlSoft,
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
  },
  synopsis: {
    color: palette.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
  },
  castText: {
    color: palette.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  seasonSection: {
    gap: 14,
    marginTop: 4,
  },
  segmentedBar: {
    flexDirection: "row",
    padding: 4,
  },
  segmentSlot: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSlotActive: {
    backgroundColor: palette.pearl,
    shadowColor: "#FFF4EC",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  segmentLabel: {
    color: palette.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  segmentLabelActive: {
    color: palette.pearlInk,
    fontWeight: "800",
  },
  episodesHeading: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  epOuterPad: {
    paddingHorizontal: 18,
    marginBottom: EPISODE_ROW_GAP,
  },
  epCardInner: {
    height: EPISODE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 12,
  },
  epThumbWrap: {
    width: 112,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
  },
  epNumberBadge: {
    position: "absolute",
    top: 5,
    left: 6,
    backgroundColor: "rgba(8, 12, 19, 0.78)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  epNumberText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "800",
  },
  epCenter: {
    flex: 1,
  },
  epCode: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  epTitle: {
    color: palette.textSecondary,
    fontSize: 12.5,
    marginTop: 1,
  },
  epDlCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderColor: palette.glassStroke,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
