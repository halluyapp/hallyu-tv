import { TvButton, TvTile } from "@/components/tv/TvTile";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing, tvSafeArea, tvTypeScale } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { selectDownloadSource, selectSource } from "@/services/provider/streams";
import { downloadManager } from "@/services/downloads/manager";
import { isResumable } from "@/services/library/resume";
import { useSound } from "@/services/sound/SoundContext";
import { useLibrary } from "@/state/LibraryContext";
import { ProviderError, SeasonInfo, TitleDetail } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Bookmark, BookmarkCheck, Download, Play } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { heroScrim, heroScrimPositions } from "@/design-system/gradients";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * TV Details — a purpose-built 10-foot screen.
 *
 * The previous build pushed the phone screen onto the television: 38 px touch
 * targets, a bottom sheet for pickers, and controls that could not be focused.
 * This composition is different by design:
 *
 *   left   — large cinematic artwork (backdrop, not a phone hero)
 *   right  — a glass information panel with the primary action focused first
 *   bottom — seasons as large pills, episodes as a focusable grid
 *
 * Back returns to the shelf the user came from; the TV home restores the tile
 * focus it recorded.
 */
export function TvDetailsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  const navigation = useNavigation<Nav>();
  const { detailPath } = route.params;
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor, loading: libraryLoading } = useLibrary();
  const { play: playTone } = useSound();

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [episode, setEpisode] = useState(1);
  const [busy, setBusy] = useState<null | "play" | "download">(null);
  const [note, setNote] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const initializedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setDetail(null);
    initializedRef.current = false;
    try {
      const d = await fetchDetail(detailPath, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setDetail(d);
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof ProviderError ? err.message : "This title could not be loaded.");
    }
  }, [detailPath, fade]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Pick the season/episode the user last watched on TV.
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

  const currentSeason = detail?.mediaType === "series" ? (season?.season ?? 1) : null;
  const resume = detail ? resumeFor(detail.subjectId, currentSeason, currentSeason ? episode : null) : null;
  const canResume = isResumable(resume);
  const saved = detail ? inWatchlist(detail.subjectId) : false;

  const startPlayback = useCallback(
    async (se: number, ep: number, resumeAt: number) => {
      if (!detail || busy) return;
      setBusy("play");
      setNote(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, se, ep);
        const picked = selectSource(res.sources, null);
        if (!picked) throw new Error("empty");
        playTone("play");
        const next = detail.seasons.length > 0 ? nextEpisodeFor(detail, se, ep) : null;
        navigation.navigate("Player", {
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          season: se,
          episode: ep,
          resumeAt,
          sources: res.sources,
          nextEpisode: next,
        });
      } catch (err) {
        playTone("error");
        setNote(err instanceof ProviderError ? err.message : "Playback could not be started. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [detail, busy, navigation, playTone],
  );

  const startDownload = useCallback(
    async (se: number, ep: number) => {
      if (!detail || busy) return;
      setBusy("download");
      setNote(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, se, ep);
        const pick = selectDownloadSource(res.sources, null);
        if (!pick) {
          setNote("No downloadable MP4 source was returned for this selection.");
          return;
        }
        await downloadManager.enqueue({
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          season: se,
          episode: ep,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          source: pick,
          expectedBytes: pick.sizeBytes,
        });
        playTone("confirm");
        setNote("Download queued. It continues in the background.");
      } catch (err) {
        playTone("error");
        setNote(err instanceof ProviderError ? err.message : "The download could not be started.");
      } finally {
        setBusy(null);
      }
    },
    [detail, busy, playTone],
  );

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>This title could not be loaded</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.lg }}>
          <TvButton label="Try again" onPress={() => void load()} hasPreferredFocus />
          <TvButton label="Back" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingLabel}>Loading title…</Text>
      </View>
    );
  }

  const isSeries = detail.mediaType === "series" && detail.seasons.length > 0;
  const episodes = season ? Array.from({ length: season.maxEp }, (_, i) => i + 1) : [];
  const playingEpisode = canResume ? (resume.episode_number ?? episode) : episode;

  return (
    <View style={styles.root}>
      <AmbientGlow />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          {/* Artwork column */}
          <Animated.View style={[styles.artColumn, { opacity: fade }]}>
            <View style={styles.artFrame}>
              <Poster
                uri={detail.backdropUrl ?? detail.posterUrl}
                style={StyleSheet.absoluteFill}
                initials={initialsFor(detail.title)}
                priority="high"
                borderRadius={radius.hero}
              />
              <LinearGradient
                colors={heroScrim} locations={heroScrimPositions}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </Animated.View>

          {/* Information panel */}
          <View style={styles.infoColumn}>
            <Text numberOfLines={2} style={styles.title}>
              {detail.title}
            </Text>
            <Text style={styles.meta}>
              {[
                detail.releaseDate?.slice(0, 4),
                isSeries ? "Series" : "Movie",
                detail.country,
                detail.rating ? `★ ${detail.rating}` : null,
              ]
                .filter(Boolean)
                .join("   ·   ")}
            </Text>

            {detail.genre ? (
              <View style={styles.genres}>
                {detail.genre.split(",").slice(0, 4).map((g) => (
                  <View key={g} style={styles.genreChip}>
                    <Text style={styles.genreText}>{g.trim()}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {detail.description ? (
              <Pressable
                onPress={() => setDescExpanded((v) => !v)}
                focusable
                accessibilityRole="button"
                accessibilityLabel={descExpanded ? "Collapse synopsis" : "Expand synopsis"}
                style={styles.synopsisPress}
              >
                <Text numberOfLines={descExpanded ? undefined : 4} style={styles.synopsis}>
                  {detail.description}
                </Text>
                <Text style={styles.synopsisToggle}>{descExpanded ? "Show less" : "Read more"}</Text>
              </Pressable>
            ) : (
              <Text style={styles.synopsis}>No synopsis was provided for this title.</Text>
            )}

            <View style={styles.actions}>
              <TvButton
                label={busy === "play" ? "Preparing…" : canResume ? "Resume" : "Play"}
                icon={<Play size={20} color={palette.textOnAccent} fill={palette.textOnAccent} />}
                variant="primary"
                hasPreferredFocus
                onPress={() =>
                  void startPlayback(
                    isSeries ? (season?.season ?? 1) : 0,
                    isSeries ? playingEpisode : 0,
                    canResume ? Math.floor(resume.position_seconds) : 0,
                  )
                }
              />
              <TvButton
                label={saved ? "Saved" : "Watchlist"}
                icon={saved ? <BookmarkCheck size={20} color={palette.cyan} /> : <Bookmark size={20} color={palette.textPrimary} />}
                onPress={() => {
                  if (!detail) return;
                  playTone(saved ? "tap" : "confirm");
                  void toggleWatchlist({
                    subject_id: detail.subjectId,
                    detail_path: detail.detailPath,
                    media_type: detail.mediaType,
                    title: detail.title,
                    poster_url: detail.posterUrl,
                  });
                }}
              />
              <TvButton
                label={busy === "download" ? "Starting…" : "Download"}
                icon={<Download size={20} color={palette.textPrimary} />}
                onPress={() => void startDownload(isSeries ? (season?.season ?? 1) : 0, isSeries ? playingEpisode : 0)}
              />
            </View>

            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
        </View>

        {isSeries ? (
          <View style={styles.episodeSection}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            {detail.seasons.length > 1 ? (
              <View style={styles.seasonRow}>
                {detail.seasons.map((s) => {
                  const active = season?.season === s.season;
                  return (
                    <Pressable
                      key={s.season}
                      onPress={() => {
                        setSeason(s);
                        setEpisode(1);
                        playTone("tap");
                      }}
                      focusable
                      accessibilityRole="button"
                      accessibilityLabel={`Season ${s.season}, ${s.maxEp} episodes`}
                      style={[styles.seasonPill, active && styles.seasonPillActive]}
                    >
                      <Text style={[styles.seasonText, active && styles.seasonTextActive]}>Season {s.season}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <FlatList
              data={episodes}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(ep) => String(ep)}
              contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.sm }}
              renderItem={({ item: ep }) => {
                const p = resumeFor(detail.subjectId, season?.season ?? 1, ep);
                const watched = p ? p.completed : false;
                const inProgress = p && !p.completed && p.position_seconds > 5;
                const isCurrent = ep === playingEpisode;
                return (
                  <TvTile
                    title={`Episode ${ep}`}
                    posterUrl={detail.posterUrl}
                    initials={String(ep).padStart(2, "0")}
                    meta={watched ? "Watched" : inProgress ? `${Math.floor(p.position_seconds / 60)} min in` : isCurrent ? "Selected" : null}
                    progress={p && p.duration_seconds > 0 ? p.position_seconds / p.duration_seconds : null}
                    width={210}
                    onPress={() => {
                      setEpisode(ep);
                      void startPlayback(season?.season ?? 1, ep, p && !p.completed ? Math.floor(p.position_seconds) : 0);
                    }}
                  />
                );
              }}
            />
          </View>
        ) : null}

        {detail.cast.length > 0 ? (
          <View style={styles.episodeSection}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <View style={styles.castRow}>
              {detail.cast.slice(0, 8).map((member) => (
                <View key={member.name} style={styles.castItem}>
                  <Poster uri={member.avatarUrl} style={styles.castAvatar} initials={initialsFor(member.name)} borderRadius={40} />
                  <Text numberOfLines={1} style={styles.castName}>
                    {member.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Following episode within the season, else episode 1 of the next season. */
function nextEpisodeFor(detail: TitleDetail, seasonNumber: number, episodeNumber: number): { season: number; episode: number } | null {
  if (detail.mediaType !== "series") return null;
  const current = detail.seasons.find((s) => s.season === seasonNumber);
  if (current && episodeNumber < current.maxEp) return { season: seasonNumber, episode: episodeNumber + 1 };
  const later = detail.seasons.filter((s) => s.season > seasonNumber).sort((a, b) => a.season - b.season)[0];
  return later ? { season: later.season, episode: 1 } : null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  scroll: { padding: tvSafeArea.horizontal, paddingBottom: spacing.huge },
  centered: { flex: 1, backgroundColor: palette.background, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  loadingLabel: { ...tvTypeScale.body, color: palette.textSecondary },
  errorTitle: { ...tvTypeScale.title, color: palette.textPrimary },
  errorBody: { ...tvTypeScale.body, color: palette.textSecondary, textAlign: "center", maxWidth: 700 },
  topRow: { flexDirection: "row", gap: spacing.xxl, alignItems: "flex-start" },
  artColumn: { flex: 1.15 },
  artFrame: { height: 460, borderRadius: radius.hero, overflow: "hidden", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassStroke },
  infoColumn: { flex: 1, gap: spacing.sm, paddingTop: spacing.sm },
  title: { ...tvTypeScale.display, color: palette.textPrimary },
  meta: { ...tvTypeScale.caption, color: palette.textSecondary },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  genreChip: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  genreText: { ...tvTypeScale.caption, color: palette.textSecondary },
  synopsisPress: { marginTop: spacing.sm },
  synopsis: { ...tvTypeScale.body, color: palette.textPrimary, lineHeight: 30 },
  synopsisToggle: { ...tvTypeScale.caption, color: palette.cyan, marginTop: spacing.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  note: { ...tvTypeScale.caption, color: palette.warning, marginTop: spacing.sm },
  episodeSection: { marginTop: spacing.xxl },
  sectionTitle: { ...tvTypeScale.title, color: palette.textPrimary, marginBottom: spacing.md },
  seasonRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  seasonPill: {
    borderWidth: 3,
    borderColor: "transparent",
    backgroundColor: palette.glassFill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    minHeight: 56,
    justifyContent: "center",
  },
  seasonPillActive: { backgroundColor: palette.accentSoft },
  seasonPillFocused: { borderColor: palette.cyan },
  seasonText: { ...tvTypeScale.body, color: palette.textSecondary, fontWeight: "600" },
  seasonTextActive: { color: palette.textPrimary },
  castRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xl },
  castItem: { width: 120, alignItems: "center", gap: spacing.sm },
  castAvatar: { width: 88, height: 88 },
  castName: { ...tvTypeScale.caption, color: palette.textPrimary, textAlign: "center" },
});
