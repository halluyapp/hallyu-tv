import { Button } from "@/components/ui/Button";
import { useGate } from "@/components/auth/GateProvider";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonFill } from "@/components/ui/PosterCard";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { selectSource } from "@/services/provider/streams";
import { downloadManager } from "@/services/downloads/manager";
import { useLibrary } from "@/state/LibraryContext";
import { ProviderError, SeasonInfo, TitleDetail } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bookmark, BookmarkCheck, ChevronDown, Download, Play, Monitor, ChevronRight } from "lucide-react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Paired TVs authenticate with a device session, not a user login — the guest gate is phone-only. */
const IS_TV = Platform.isTV;

export function DetailsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  const navigation = useNavigation<Nav>();
  const { detailPath, subjectId } = route.params;
  const { user } = useAuth();
  const { showGate } = useGate();
  const { inWatchlist, toggleWatchlist, resumeFor, progress } = useLibrary();
  const insets = useSafeAreaInsets();

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [episode, setEpisode] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setError(null);
    setDetail(null);
    fetchDetail(detailPath)
      .then((d) => {
        if (stale) return;
        setDetail(d);
        const first = d.seasons[0] ?? null;
        setSeason(first);
        setEpisode(1);
      })
      .catch((err) => !stale && setError(err instanceof ProviderError ? err.message : "Could not load this title."));
    return () => {
      stale = true;
    };
  }, [detailPath]);

  const saved = detail ? inWatchlist(detail.subjectId) : false;
  const currentSeason = detail?.mediaType === "series" ? season?.season ?? 1 : null;
  const selectedSeason = season?.season ?? null;

  const resume = useMemo(() => {
    if (!detail) return null;
    return resumeFor(detail.subjectId, currentSeason, currentSeason ? episode : null);
  }, [detail, resumeFor, currentSeason, episode, progress]);

  /** Season/episode are passed explicitly — never read from state after a setState. */
  const play = useCallback(
    async (opts: { resumeAt: number; season?: number | null; episode?: number | null }) => {
      if (!detail) return;
      if (!user && !IS_TV) {
        // Guest gate: explain, sign in, return to this exact title. Playback is
        // never auto-started — the user re-taps Play.
        showGate({
          title: "Sign in to watch",
          message: `Watching “${detail.title}” needs an account so your progress and library stay with you.`,
        });
        return;
      }
      const selSeason = opts.season !== undefined ? opts.season : currentSeason;
      const selEpisode = opts.episode !== undefined ? opts.episode : currentSeason ? episode : 0;
      setResolving(true);
      setResolutionError(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, selSeason ?? 0, selEpisode ?? 0);
        if (res.sources.length === 0) {
          setResolutionError(res.note ?? "No stream is available for this selection.");
          return;
        }
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
        });
      } catch (err) {
        const message =
          err instanceof ProviderError
            ? err.message
            : "Could not start playback. The provider may be busy — try again shortly.";
        setResolutionError(message);
      } finally {
        setResolving(false);
      }
    },
    [detail, user, showGate, navigation, currentSeason, episode],
  );

  const startDownload = useCallback((opts: { season?: number | null; episode?: number | null }) => {
    if (!detail) return;
    if (!user && !IS_TV) {
      showGate({
        title: "Sign in to download",
        message: "Downloads are tied to your account and live only on this device.",
        pendingAction: () => startDownloadAfterAuth(),
      });
      return;
    }
    startDownloadAfterAuth();

    async function startDownloadAfterAuth() {
      if (!detail) return;
      const selSeason = opts.season !== undefined ? opts.season : currentSeason;
      const selEpisode = opts.episode !== undefined ? opts.episode : currentSeason ? episode : 0;
      setResolving(true);
      setResolutionError(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, selSeason ?? 0, selEpisode ?? 0);
        // Mandatory default-quality rule: verified full-length 360p, else lowest full-length.
        const pick = selectSource(res.sources, null);
        if (!pick) {
          setResolutionError("No downloadable source was returned for this selection.");
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
        navigation.navigate("Main");
      } catch (err) {
        setResolutionError(err instanceof ProviderError ? err.message : "Could not start the download.");
      } finally {
        setResolving(false);
      }
    }
  }, [detail, user, showGate, navigation, currentSeason, episode]);

  const onWatchlist = useCallback(() => {
    if (!detail) return;
    const item = {
      subject_id: detail.subjectId,
      detail_path: detail.detailPath,
      media_type: detail.mediaType,
      title: detail.title,
      poster_url: detail.posterUrl,
    };
    if (!user) {
      showGate({
        title: "Sign in to save titles",
        message: "Your watchlist follows your account across every device you sign in on.",
        pendingAction: () => void toggleWatchlist(item),
      });
      return;
    }
    void toggleWatchlist(item);
  }, [detail, user, showGate, toggleWatchlist]);

  if (error) return <View style={styles.root}><ErrorState message={error} onRetry={() => { setError(null); fetchDetail(detailPath).then(setDetail).catch(() => setError("Could not load this title.")); }} /></View>;
  if (!detail) return <View style={styles.root}><SkeletonFill /></View>;

  const synopsis = detail.description ?? "No synopsis was provided for this title.";
  const episodes = season ? Array.from({ length: season.maxEp }, (_, i) => i + 1) : [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
      <View style={styles.heroWrap}>
        {detail.backdropUrl ?? detail.posterUrl ? (
          <Image source={{ uri: detail.backdropUrl ?? detail.posterUrl ?? "" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.heroScrim} />
        <Pressable style={[styles.backBtn, { top: insets.top + spacing.sm }]} onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronDown size={22} color={palette.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{detail.title}</Text>
        <Text style={styles.meta}>
          {[
            detail.releaseDate?.slice(0, 4),
            detail.mediaType === "series" ? "Series" : "Movie",
            detail.country,
            detail.rating ? `IMDb ${detail.rating}` : null,
          ].filter(Boolean).join(" · ")}
        </Text>

        <View style={styles.actionsRow}>
          <Button
            label={resolving ? "Preparing…" : resume ? "Resume" : "Play"}
            icon={<Play size={16} color="#1A0E0A" fill="#1A0E0A" />}
            loading={resolving}
            onPress={() => void play({ resumeAt: resume && !resume.completed ? resume.position_seconds : 0 })}
            style={{ flex: 1 }}
          />
          <Pressable style={styles.iconAction} onPress={onWatchlist}>
            {saved ? <BookmarkCheck size={20} color={palette.accent} /> : <Bookmark size={20} color={palette.textSecondary} />}
          </Pressable>
          <Pressable style={styles.iconAction} onPress={() => startDownload({})}>
            <Download size={20} color={palette.textSecondary} />
          </Pressable>
        </View>

        {resolutionError ? <Text style={styles.errorNote}>{resolutionError}</Text> : null}

        {detail.genre ? (
          <View style={styles.chips}>
            {detail.genre.split(",").slice(0, 4).map((g) => (
              <View key={g} style={styles.chip}>
                <Text style={styles.chipText}>{g.trim()}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable onPress={() => setExpanded((e) => !e)}>
          <Text numberOfLines={expanded ? undefined : 3} style={styles.synopsis}>
            {synopsis}
          </Text>
          <Text style={styles.expandHint}>{expanded ? "Show less" : "More"}</Text>
        </Pressable>

        {detail.mediaType === "series" && detail.seasons.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            {detail.seasons.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                {detail.seasons.map((s) => (
                  <Pressable
                    key={s.season}
                    style={[styles.seasonChip, season?.season === s.season && styles.seasonChipActive]}
                    onPress={() => {
                      setSeason(s);
                      setEpisode(1);
                    }}
                  >
                    <Text style={[styles.seasonChipText, season?.season === s.season && styles.seasonChipTextActive]}>
                      Season {s.season}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={{ gap: spacing.sm }}>
              {episodes.map((ep) => {
                const p = resumeFor(detail.subjectId, season!.season, ep);
                const watched = p ? (p.completed || p.position_seconds / Math.max(p.duration_seconds, 1) > 0.9) : false;
                return (
                  <Pressable
                    key={ep}
                    style={[styles.episodeRow, season?.season === selectedSeason && episode === ep && styles.episodeRowActive]}
                    onPress={() => {
                      setEpisode(ep);
                      // Selection is passed explicitly so a fast tap can never start the previous episode.
                      void play({ resumeAt: p && !p.completed ? p.position_seconds : 0, season: season?.season ?? null, episode: ep });
                    }}
                  >
                    <View style={styles.episodeNumber}>
                      <Text style={styles.episodeNumberText}>{ep}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.episodeTitle} numberOfLines={1}>
                        {`Episode ${ep}`}
                      </Text>
                      <Text style={styles.episodeMeta}>
                        {watched ? "Watched" : p ? `Watching · ${Math.floor(p.position_seconds / 60)} min in` : "Ready to play"}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={palette.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {detail.cast.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <View style={styles.castRow}>
              {detail.cast.slice(0, 6).map((s) => (
                <View key={s.name} style={styles.castItem}>
                  {s.avatarUrl ? (
                    <Image source={{ uri: s.avatarUrl }} style={styles.castAvatar} />
                  ) : (
                    <View style={[styles.castAvatar, { backgroundColor: palette.surfaceRaised }]} />
                  )}
                  <Text numberOfLines={1} style={styles.castName}>{s.name}</Text>
                  {s.character ? <Text numberOfLines={1} style={styles.castRole}>{s.character}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.deviceHint, { marginTop: spacing.xl }]}>
          <Monitor size={14} color={palette.textMuted} />
          <Text style={styles.deviceHintText}>Progress, watchlist and downloads stay with your account.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  heroWrap: { height: 300, backgroundColor: palette.surface },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,10,13,0.35)" },
  backBtn: {
    position: "absolute",
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(8,10,13,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: { ...typeScale.display, color: palette.textPrimary },
  meta: { ...typeScale.caption, color: palette.textSecondary, marginTop: spacing.xs },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  iconAction: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: palette.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
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
  synopsis: { ...typeScale.body, color: palette.textPrimary, lineHeight: 23, marginTop: spacing.lg },
  expandHint: { color: palette.accent, fontSize: 13, fontWeight: "700", marginTop: spacing.xs },
  sectionTitle: { ...typeScale.headline, color: palette.textPrimary, marginBottom: spacing.md },
  seasonChip: {
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: spacing.sm,
  },
  seasonChipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  seasonChipText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  seasonChipTextActive: { color: "#1A0E0A" },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  episodeRowActive: { borderColor: palette.accent, backgroundColor: "rgba(240,120,85,0.08)" },
  episodeNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeNumberText: { color: palette.textPrimary, fontWeight: "700", fontSize: 14 },
  episodeTitle: { color: palette.textPrimary, fontWeight: "600", fontSize: 14 },
  episodeMeta: { color: palette.textMuted, fontSize: 12 },
  castRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  castItem: { width: 72, gap: 6, alignItems: "center" },
  castAvatar: { width: 60, height: 60, borderRadius: 30 },
  castName: { color: palette.textPrimary, fontSize: 11, fontWeight: "600", textAlign: "center" },
  castRole: { color: palette.textMuted, fontSize: 10, textAlign: "center" },
  deviceHint: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deviceHintText: { color: palette.textMuted, fontSize: 12, flex: 1 },
});
