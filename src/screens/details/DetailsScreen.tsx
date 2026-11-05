import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { SkeletonFill } from "@/components/ui/PosterCard";
import { useStage } from "@/hooks/useStage";
import { palette, radius, spacing, gradients } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { selectDownloadSource } from "@/services/provider/streams";
import { downloadManager } from "@/services/downloads/manager";
import { useLibrary } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import { ProviderError, SeasonInfo, TitleDetail } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Download,
  Play,
  Monitor,
  ChevronRight,
  Volume2,
  VolumeX,
  Star,
  Film,
  Tv,
} from "lucide-react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function nextEpisodeFor(detail: TitleDetail, season: number, episode: number): { season: number; episode: number } | null {
  if (detail.mediaType !== "series") return null;
  const current = detail.seasons.find((s) => s.season === season);
  if (current && episode < current.maxEp) return { season, episode: episode + 1 };
  const later = detail.seasons.filter((s) => s.season > season).sort((a, b) => a.season - b.season)[0];
  return later ? { season: later.season, episode: 1 } : null;
}

export function DetailsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  const navigation = useNavigation<Nav>();
  const { detailPath } = route.params;
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor, loading: libraryLoading } = useLibrary();
  const { play: playTone } = useSound();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [episode, setEpisode] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const initializedRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setDetail(null);
    initializedRef.current = false;
    try {
      const d = await fetchDetail(detailPath);
      setDetail(d);
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Could not load this title.");
    }
  }, [detailPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || libraryLoading || initializedRef.current) return;
    initializedRef.current = true;
    if (detail.mediaType !== "series") {
      setSeason(null);
      setEpisode(1);
      return;
    }
    const latest = latestFor(detail.subjectId);
    const matched = latest?.season_number != null ? detail.seasons.find((s) => s.season === latest.season_number) : null;
    const first = matched ?? detail.seasons[0] ?? null;
    setSeason(first);
    const ep = matched && latest?.episode_number != null ? latest.episode_number : 1;
    setEpisode(first ? Math.min(Math.max(1, ep), first.maxEp) : 1);
  }, [detail, libraryLoading, latestFor]);

  const saved = detail ? inWatchlist(detail.subjectId) : false;
  const currentSeason = detail?.mediaType === "series" ? season?.season ?? 1 : null;

  const resume = useMemo(() => {
    if (!detail) return null;
    return resumeFor(detail.subjectId, currentSeason, currentSeason ? episode : null);
  }, [detail, resumeFor, currentSeason, episode]);

  const play = useCallback(
    async (opts: { resumeAt: number; season?: number | null; episode?: number | null }) => {
      if (!detail || resolving) return;
      const selSeason = opts.season !== undefined ? opts.season : currentSeason;
      const selEpisode = opts.episode !== undefined ? opts.episode : currentSeason ? episode : 0;
      setResolving(true);
      setResolutionError(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, selSeason ?? 0, selEpisode ?? 0);
        playTone("play");
        navigation.navigate("Player", {
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          season: selSeason ?? 0,
          episode: selEpisode ?? 0,
          resumeAt: opts.resumeAt,
          sources: res.sources,
          nextEpisode: nextEpisodeFor(detail, selSeason ?? 0, selEpisode ?? 0),
        });
      } catch (err) {
        playTone("error");
        setResolutionError(err instanceof ProviderError ? err.message : "Could not start playback. The provider may be busy — try again shortly.");
      } finally {
        setResolving(false);
      }
    },
    [detail, resolving, navigation, currentSeason, episode, playTone],
  );

  const startDownload = useCallback(
    async (opts: { season?: number | null; episode?: number | null }) => {
      if (!detail || resolving) return;
      const selSeason = opts.season !== undefined ? opts.season : currentSeason;
      const selEpisode = opts.episode !== undefined ? opts.episode : currentSeason ? episode : 0;
      setResolving(true);
      setResolutionError(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, selSeason ?? 0, selEpisode ?? 0);
        const pick = selectDownloadSource(res.sources, null);
        if (!pick) {
          setResolutionError("No downloadable MP4 source was returned for this selection.");
          return;
        }
        await downloadManager.enqueue({
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          season: selSeason ?? 0,
          episode: selEpisode ?? 0,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          source: pick,
          expectedBytes: pick.sizeBytes,
        });
        if (Platform.isTV) navigation.navigate("TvDownloads");
        else navigation.navigate("Main", { screen: "Downloads" });
      } catch (err) {
        playTone("error");
        setResolutionError(err instanceof ProviderError ? err.message : "Could not start the download.");
      } finally {
        setResolving(false);
      }
    },
    [detail, resolving, navigation, currentSeason, episode, playTone],
  );

  const onWatchlist = useCallback(() => {
    if (!detail) return;
    playTone(saved ? "tap" : "confirm");
    void toggleWatchlist({
      subject_id: detail.subjectId,
      detail_path: detail.detailPath,
      media_type: detail.mediaType,
      title: detail.title,
      poster_url: detail.posterUrl,
    });
  }, [detail, toggleWatchlist, saved, playTone]);

  const toggleSpeaking = useCallback(() => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      playTone("tap");
      return;
    }
    if (!detail?.description) return;
    Speech.speak(detail.description, {
      rate: 1.0,
      pitch: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    setSpeaking(true);
    playTone("confirm");
  }, [speaking, detail, playTone]);

  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );

  if (error) {
    return (
      <View style={styles.root}>
        <ErrorState message={error} onRetry={() => void load()} />
      </View>
    );
  }
  if (!detail) return <View style={styles.root}><SkeletonFill /></View>;

  const synopsis = detail.description ?? "No synopsis was provided for this title.";
  const episodes = season ? Array.from({ length: season.maxEp }, (_, i) => i + 1) : [];
  const isSeries = detail.mediaType === "series";

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* Giant Cinematic Backdrop */}
        <View style={[styles.heroWrap, { height: stage.heroHeight }]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  {
                    scale: scrollY.interpolate({
                      inputRange: [-120, 0, stage.heroHeight],
                      outputRange: [1.25, 1.05, 1],
                      extrapolate: "clamp",
                    }),
                  },
                  {
                    translateY: scrollY.interpolate({
                      inputRange: [0, stage.heroHeight],
                      outputRange: [0, stage.heroHeight * 0.35],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            ]}
          >
            {detail.backdropUrl ?? detail.posterUrl ? (
              <Poster uri={detail.backdropUrl ?? detail.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(detail.title)} />
            ) : null}
          </Animated.View>

          {/* Ambient Cinema Scrim */}
          <LinearGradient
            colors={["rgba(4, 6, 10, 0.2)", "rgba(4, 6, 10, 0.65)", "#04060A"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Liquid Glass Back Button */}
          <Pressable
            style={[styles.backBtn, { top: insets.top + spacing.sm }]}
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronDown size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={[styles.body, { paddingHorizontal: stage.gutter }]}>
          {/* Title & Metadata Badges */}
          <Text style={[styles.title, { fontSize: stage.titleSize }]}>{detail.title}</Text>

          <View style={styles.badgeRow}>
            {detail.releaseDate ? (
              <View style={styles.glassBadge}>
                <Text style={styles.badgeText}>{detail.releaseDate.slice(0, 4)}</Text>
              </View>
            ) : null}

            <View style={styles.glassBadge}>
              {isSeries ? <Tv size={11} color={palette.textSecondary} /> : <Film size={11} color={palette.textSecondary} />}
              <Text style={styles.badgeText}>{isSeries ? "Series" : "Movie"}</Text>
            </View>

            {detail.rating ? (
              <View style={styles.glassBadge}>
                <Star size={11} color="#FBBF24" fill="#FBBF24" />
                <Text style={[styles.badgeText, { color: "#FFFFFF", fontWeight: "700" }]}>{detail.rating}</Text>
              </View>
            ) : null}

            {detail.country ? (
              <View style={styles.glassBadge}>
                <Text style={styles.badgeText}>{detail.country}</Text>
              </View>
            ) : null}
          </View>

          {/* Primary Action Row */}
          <View style={styles.actionsRow}>
            <Button
              label={resolving ? "Preparing..." : resume && !resume.completed ? "Resume" : "Play Now"}
              icon={<Play size={18} color="#FFFFFF" fill="#FFFFFF" />}
              loading={resolving}
              onPress={() => void play({ resumeAt: resume && !resume.completed ? resume.position_seconds : 0 })}
              style={{ flex: 1 }}
              size="lg"
            />

            <Pressable
              style={[styles.iconAction, saved && styles.iconActionActive]}
              onPress={onWatchlist}
              hitSlop={8}
            >
              {saved ? (
                <BookmarkCheck size={20} color={palette.accentBright} />
              ) : (
                <Bookmark size={20} color={palette.textSecondary} />
              )}
            </Pressable>

            <Pressable
              style={styles.iconAction}
              onPress={() => void startDownload({})}
              disabled={resolving}
              hitSlop={8}
            >
              <Download size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          {resolutionError ? <Text style={styles.errorNote}>{resolutionError}</Text> : null}

          {/* Genre Chips */}
          {detail.genre ? (
            <View style={styles.chips}>
              {detail.genre.split(",").slice(0, 5).map((g) => (
                <View key={g} style={styles.chip}>
                  <Text style={styles.chipText}>{g.trim()}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Synopsis with Glass Container */}
          <View style={styles.synopsisCard}>
            <Pressable onPress={() => setExpanded((e) => !e)}>
              <Text numberOfLines={expanded ? undefined : 3} style={styles.synopsis}>
                {synopsis}
              </Text>
              <Text style={styles.expandHint}>{expanded ? "Show less" : "Read more"}</Text>
            </Pressable>

            {detail.description ? (
              <Pressable
                style={styles.listenBtn}
                onPress={toggleSpeaking}
                accessibilityRole="button"
                accessibilityLabel={speaking ? "Stop reading" : "Listen to synopsis"}
              >
                {speaking ? <VolumeX size={15} color={palette.accent} /> : <Volume2 size={15} color={palette.textSecondary} />}
                <Text style={[styles.listenLabel, speaking && { color: palette.accent }]}>
                  {speaking ? "Stop voice" : "Audio synopsis"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Episodes Section for Series */}
          {isSeries && detail.seasons.length > 0 ? (
            <View style={{ marginTop: spacing.xl }}>
              <Text style={[styles.sectionTitle, { fontSize: stage.railTitleSize }]}>Episodes</Text>

              {detail.seasons.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.md }}>
                  {detail.seasons.map((s) => {
                    const isActive = season?.season === s.season;
                    return (
                      <Pressable
                        key={s.season}
                        style={[styles.seasonChip, isActive && styles.seasonChipActive]}
                        onPress={() => {
                          setSeason(s);
                          setEpisode(1);
                        }}
                      >
                        {isActive && (
                          <LinearGradient
                            colors={gradients.accent}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                        )}
                        <Text style={[styles.seasonChipText, isActive && styles.seasonChipTextActive]}>
                          Season {s.season}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <View style={{ gap: spacing.sm }}>
                {episodes.map((ep) => {
                  const p = resumeFor(detail.subjectId, season!.season, ep);
                  const watched = p ? p.completed || p.position_seconds / Math.max(p.duration_seconds, 1) > 0.9 : false;
                  const isCurrent = episode === ep;

                  return (
                    <Pressable
                      key={ep}
                      style={[styles.episodeRow, isCurrent && styles.episodeRowActive]}
                      onPress={() => {
                        setEpisode(ep);
                        void play({ resumeAt: p && !p.completed ? p.position_seconds : 0, season: season?.season ?? null, episode: ep });
                      }}
                    >
                      <View style={[styles.episodeNumber, isCurrent && styles.episodeNumberActive]}>
                        <Text style={[styles.episodeNumberText, isCurrent && { color: "#FFFFFF" }]}>{ep}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.episodeTitle} numberOfLines={1}>{`Episode ${ep}`}</Text>
                        <Text style={styles.episodeMeta}>
                          {watched ? "Completed" : p ? `${Math.floor(p.position_seconds / 60)}m watched` : "Available to stream"}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={isCurrent ? palette.accentBright : palette.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Cast */}
          {detail.cast.length > 0 ? (
            <View style={{ marginTop: spacing.xl }}>
              <Text style={[styles.sectionTitle, { fontSize: stage.railTitleSize }]}>Cast</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.sm }}>
                {detail.cast.slice(0, 8).map((c) => (
                  <View key={c.name} style={styles.castItem}>
                    <Poster
                      uri={c.avatarUrl}
                      style={styles.castAvatar}
                      initials={initialsFor(c.name)}
                    />
                    <Text numberOfLines={1} style={styles.castName}>{c.name}</Text>
                    {c.character ? <Text numberOfLines={1} style={styles.castRole}>{c.character}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.deviceHint, { marginTop: spacing.xxl }]}>
            <Monitor size={14} color={palette.textMuted} />
            <Text style={styles.deviceHintText}>Offline downloads and resume state are synchronized locally on this device.</Text>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  heroWrap: { position: "relative", backgroundColor: palette.surface },
  backBtn: {
    position: "absolute",
    left: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(14, 20, 30, 0.75)",
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  body: { paddingTop: spacing.md },
  title: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  glassBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  iconAction: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionActive: {
    borderColor: palette.accentBright,
    backgroundColor: "rgba(255, 94, 58, 0.16)",
  },
  errorNote: { color: palette.danger, fontSize: 13, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  chip: {
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { color: palette.textSecondary, fontSize: 12, fontWeight: "600" },
  synopsisCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
  },
  synopsis: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  expandHint: { color: palette.accent, fontSize: 13, fontWeight: "700", marginTop: spacing.xs },
  listenBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  listenLabel: { color: palette.textSecondary, fontSize: 12, fontWeight: "600" },
  sectionTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    overflow: "hidden",
    position: "relative",
  },
  seasonChipActive: {
    borderColor: palette.accentBright,
  },
  seasonChipText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  seasonChipTextActive: { color: "#FFFFFF", fontWeight: "700" },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  episodeRowActive: {
    borderColor: palette.accentBright,
    backgroundColor: palette.glassFillStrong,
  },
  episodeNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeNumberActive: {
    backgroundColor: palette.accent,
  },
  episodeNumberText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  episodeTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  episodeMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  castItem: {
    width: 72,
    alignItems: "center",
  },
  castAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 6,
    borderColor: palette.glassStrokeBright,
    borderWidth: 1,
  },
  castName: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  castRole: {
    color: palette.textMuted,
    fontSize: 10,
    textAlign: "center",
  },
  deviceHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  deviceHintText: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
