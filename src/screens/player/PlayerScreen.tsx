import { palette, spacing } from "@/design-system/tokens";
import { Platform } from "react-native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { PROVIDER_MEDIA_HEADERS } from "@/services/provider/client";
import { classifyPlayerError, playerErrorMessage, PlayerErrorKind } from "@/services/player/classify";
import { PlayerControls } from "./PlayerControls";
import { PickerSheet, QualityOptions, SubtitleOptions } from "./PickerSheets";
import { pickRecoverySource, qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { cueAt, parseSubtitles, Cue } from "@/services/subtitles/srt";
import { useLibrary, COMPLETION_THRESHOLD } from "@/state/LibraryContext";
import { CaptionTrack, StreamSource } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView, VideoSource } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_RECOVERY_ATTEMPTS = 4;
const BUFFER_STALL_TIMEOUT_MS = 30_000;

function isOfflineUri(uri: string): boolean {
  return /^(file|content|ph|assets-library):/i.test(uri);
}

function videoSourceFor(source: StreamSource): VideoSource {
  return isOfflineUri(source.url) ? { uri: source.url } : { uri: source.url, headers: { ...PROVIDER_MEDIA_HEADERS } };
}

export function PlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const navigation = useNavigation<Nav>();
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt } = route.params;
  const { saveProgress } = useLibrary();
  const insets = useSafeAreaInsets();
  const isTV = Platform.isTV;

  useKeepAwake();

  const [availableSources, setAvailableSources] = useState<StreamSource[]>(sources);
  const [source, setSource] = useState<StreamSource | null>(() => selectSource(sources, null));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [subtitlePickerOpen, setSubtitlePickerOpen] = useState(false);
  const [tracks, setTracks] = useState<CaptionTrack[] | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<CaptionTrack | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [currentCue, setCurrentCue] = useState<Cue | null>(null);
  const [position, setPosition] = useState(resumeAt);
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });
  const lastSavedRef = useRef(0);
  const captionAbortRef = useRef<AbortController | null>(null);
  const captionSeqRef = useRef(0);
  const episodeKey = `${subjectId}|${detailPath}|${season}|${episode}`;
  const lastEpisodeKeyRef = useRef(episodeKey);

  const startAt = Math.max(0, resumeAt);
  const initialSource = useMemo(() => (source ? videoSourceFor(source) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useVideoPlayer(initialSource, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.currentTime = startAt;
    if (initialSource) p.play();
  });

  const playing = useEvent(player, "playingChange", { isPlaying: false });
  const statusChange = useEvent(player, "statusChange", { status: "loading" as const, error: undefined });
  const timeUpdate = useEvent(player, "timeUpdate", {
    currentTime: startAt,
    currentLiveTimestamp: null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });

  const offline = source ? isOfflineUri(source.url) : false;
  const qualityList = useMemo(() => qualityOptions(availableSources), [availableSources]);

  useEffect(() => {
    setIsPlaying(playing.isPlaying);
    if (playing.isPlaying) setBuffering(false);
  }, [playing]);

  const showError = useCallback((kind: PlayerErrorKind, detail?: string | null) => {
    setStatus("error");
    setBuffering(false);
    setFailMessage(detail ?? playerErrorMessage(kind));
  }, []);

  /** Replace the native player's source while preserving playback position. */
  const applySource = useCallback(
    async (next: StreamSource, at: number) => {
      const seq = ++requestSeqRef.current;
      setSource(next);
      sourceRef.current = next;
      recoveryRef.current.triedUrls.add(next.url);
      setStatus("loading");
      setBuffering(true);
      setFailMessage(null);
      try {
        await player.replaceAsync(videoSourceFor(next));
        if (seq !== requestSeqRef.current) return;
        player.currentTime = Math.max(0, at);
        player.play();
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    },
    [player, showError],
  );

  /** Bounded direct-CDN recovery: fresh resolve, same quality first, then fallback. */
  const recover = useCallback(
    async (kind: PlayerErrorKind, detail?: string | null) => {
      const state = recoveryRef.current;
      const current = sourceRef.current;
      if (state.running) return;
      if (!current || isOfflineUri(current.url)) {
        showError(kind, detail);
        return;
      }
      if (state.attempts >= MAX_RECOVERY_ATTEMPTS) {
        showError(kind, detail);
        return;
      }
      state.running = true;
      state.attempts += 1;
      const at = player.currentTime;
      state.triedUrls.add(current.url);
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked = pickRecoverySource(res.sources, state.triedUrls, current.resolution);
        if (!picked) {
          showError(kind, detail ?? playerErrorMessage(kind));
          return;
        }
        await applySource(picked, at);
      } catch (err) {
        const nested = classifyPlayerError(err instanceof Error ? err.message : "");
        showError(kind, playerErrorMessage(nested === "unknown" ? kind : nested));
      } finally {
        state.running = false;
      }
    },
    [player, subjectId, detailPath, season, episode, applySource, showError],
  );

  // If the screen is reused for a different episode, reset everything and load
  // the new selection instead of keeping the previous episode's player state.
  useEffect(() => {
    if (lastEpisodeKeyRef.current === episodeKey) return;
    lastEpisodeKeyRef.current = episodeKey;
    captionAbortRef.current?.abort();
    captionSeqRef.current += 1;
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    lastSavedRef.current = 0;
    setAvailableSources(sources);
    setTracks(null);
    setActiveTrack(null);
    setCues([]);
    setCurrentCue(null);
    setTracksError(null);
    setPosition(resumeAt);
    const next = selectSource(sources, null);
    if (next) void applySource(next, resumeAt);
    else showError("format", "No playable source was returned for this episode.");
  }, [episodeKey, sources, resumeAt, applySource, showError]);

  useEffect(() => {
    setBuffering(statusChange.status === "loading");
    if (statusChange.status === "readyToPlay") {
      setStatus("ready");
      setFailMessage(null);
      return;
    }
    if (statusChange.status === "error") {
      const kind = classifyPlayerError(statusChange.error?.message ?? "");
      void recover(kind, null);
    }
  }, [statusChange, recover]);

  useEffect(() => {
    if (!buffering || status === "error") return;
    const t = setTimeout(() => {
      if (sourceRef.current) void recover("buffering_timeout", null);
    }, BUFFER_STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [buffering, status, recover]);

  // Progress + subtitle clock. Persist locally every 10s of playback.
  useEffect(() => {
    const t = timeUpdate?.currentTime ?? position;
    const d = player.duration;
    setPosition(t);
    setBufferedPosition(Math.max(0, timeUpdate?.bufferedPosition ?? 0));
    if (d > 0) setDuration(d);
    setCurrentCue(activeTrack ? cueAt(cues, t * 1000, subtitleOffset * 1000) : null);

    if (t > 0 && t - lastSavedRef.current >= 10) {
      lastSavedRef.current = t;
      void saveProgress({
        subject_id: subjectId,
        detail_path: detailPath,
        media_type: mediaType,
        title,
        poster_url: route.params.posterUrl,
        season_number: season || null,
        episode_number: episode || null,
        position_seconds: Math.floor(t),
        duration_seconds: Math.floor(d),
        completed: d > 0 && t / d >= COMPLETION_THRESHOLD,
      });
    }
  }, [timeUpdate, player, activeTrack, cues, subtitleOffset, subjectId, detailPath, mediaType, title, season, episode, saveProgress, route.params.posterUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTrack) setCurrentCue(cueAt(cues, player.currentTime * 1000, subtitleOffset * 1000));
  }, [cues, subtitleOffset, activeTrack, player]);

  // Save on unmount.
  const saveOnExitRef = useRef<() => void>(() => {});
  saveOnExitRef.current = () => {
    const t = player.currentTime;
    const d = player.duration;
    if (t > 3) {
      void saveProgress({
        subject_id: subjectId,
        detail_path: detailPath,
        media_type: mediaType,
        title,
        poster_url: route.params.posterUrl,
        season_number: season || null,
        episode_number: episode || null,
        position_seconds: Math.floor(t),
        duration_seconds: Math.floor(d),
        completed: d > 0 && t / d >= COMPLETION_THRESHOLD,
      });
    }
  };
  useEffect(() => () => saveOnExitRef.current(), []);
  useEffect(() => () => captionAbortRef.current?.abort(), []);

  const loadCaptions = useCallback(async () => {
    if (tracks !== null || tracksLoading) return;
    setTracksLoading(true);
    setTracksError(null);
    captionAbortRef.current?.abort();
    const controller = new AbortController();
    captionAbortRef.current = controller;
    try {
      const t = await fetchCaptions(subjectId, detailPath, season, episode, controller.signal);
      if (!controller.signal.aborted) setTracks(t);
    } catch {
      if (!controller.signal.aborted) {
        setTracks([]);
        setTracksError("Subtitle tracks could not be loaded. Check your connection and retry.");
      }
    } finally {
      if (!controller.signal.aborted) setTracksLoading(false);
    }
  }, [tracks, tracksLoading, subjectId, detailPath, season, episode]);

  const selectTrack = useCallback(
    async (track: CaptionTrack | null) => {
      const seq = ++captionSeqRef.current;
      setActiveTrack(track);
      setCues([]);
      setCurrentCue(null);
      setTracksError(null);
      if (!track) return;
      try {
        const body = await fetchCaptionText(track.url);
        if (seq !== captionSeqRef.current) return;
        const parsed = parseSubtitles(body);
        if (parsed.length === 0) throw new Error("empty");
        setCues(parsed);
      } catch {
        if (seq !== captionSeqRef.current) return;
        setActiveTrack(null);
        setTracksError("This subtitle track could not be loaded.");
      }
    },
    [],
  );

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (player.playing) {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setControlsVisible(false));
      }
    }, 3200);
  }, [player, controlsOpacity]);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  const skip = useCallback(
    (seconds: number) => {
      const max = player.duration > 0 ? player.duration : player.currentTime + seconds;
      player.currentTime = Math.max(0, Math.min(max, player.currentTime + seconds));
      showControls();
    },
    [player, showControls],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
      void applySource(next, player.currentTime);
    },
    [applySource, player],
  );

  /** Manual retry always resolves a fresh direct URL (offline files are reused). */
  const retry = useCallback(() => {
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    const current = sourceRef.current;
    const at = player.currentTime;
    if (!current) {
      showError("format", "No playable source is available.");
      return;
    }
    if (isOfflineUri(current.url)) {
      void applySource(current, at);
      return;
    }
    setStatus("loading");
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, current.resolution) ?? selectSource(res.sources, null);
        if (!picked) throw new Error("No playable source was returned.");
        await applySource(picked, at);
      } catch (err) {
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    })();
  }, [player, subjectId, detailPath, season, episode, applySource, showError]);

  const episodeLabel = mediaType === "series" ? `Season ${season} · Episode ${episode}` : null;

  if (!source) {
    return (
      <View style={styles.root}>
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Nothing to play</Text>
          <Text style={styles.errorMessage}>No full-length playable source was returned for this title.</Text>
          <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.errorBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: isTV ? 0 : insets.top, paddingBottom: isTV ? 0 : insets.bottom }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={showControls}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      </Pressable>

      {activeTrack && currentCue ? (
        <View style={[styles.subtitleOverlay, { bottom: controlsVisible ? 110 : 48 }]} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentCue.text}</Text>
        </View>
      ) : null}

      {status === "loading" || (buffering && status === "ready") ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.bufferLabel}>{offline ? "Opening offline file…" : "Preparing stream…"}</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Playback problem</Text>
          <Text style={styles.errorMessage}>{failMessage ?? "Something interrupted this stream."}</Text>
          <Pressable style={[styles.errorBtn, { backgroundColor: palette.accent }]} onPress={retry}>
            <Text style={[styles.errorBtnText, { color: "#160B08" }]}>Retry</Text>
          </Pressable>
          <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.errorBtnText}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      {controlsVisible && status !== "error" ? (
        <Animated.View style={[styles.chromeWrap, { opacity: controlsOpacity }]} pointerEvents="box-none">
          <PlayerControls
            title={title}
            episodeLabel={episodeLabel}
            transportLabel={offline ? "Offline" : "Streaming"}
            position={position}
            duration={duration}
            buffered={bufferedPosition}
            isPlaying={isPlaying}
            quality={offline ? "Offline" : source.resolution}
            subtitleLabel={activeTrack ? activeTrack.languageName : null}
            isTV={isTV}
            onTogglePlay={togglePlay}
            onSkip={skip}
            onSeek={(t) => {
              player.currentTime = t;
              showControls();
            }}
            onBack={() => navigation.goBack()}
            onQuality={() => setQualityPickerOpen(true)}
            onSubtitles={() => {
              void loadCaptions();
              setSubtitlePickerOpen(true);
            }}
          />
        </Animated.View>
      ) : null}

      {qualityPickerOpen ? (
        <PickerSheet title="Quality" onClose={() => setQualityPickerOpen(false)}>
          <QualityOptions sources={selectableSources(availableSources)} activeUri={source.url} onPick={switchSource} />
          {qualityList.length > 0 ? <Text style={styles.pickerNote}>{qualityList.length} full-length qualities available</Text> : null}
        </PickerSheet>
      ) : null}

      {subtitlePickerOpen ? (
        <PickerSheet title="Subtitles" onClose={() => setSubtitlePickerOpen(false)}>
          <SubtitleOptions
            tracks={tracks}
            loading={tracksLoading}
            error={tracksError}
            activeId={activeTrack?.id ?? null}
            offset={subtitleOffset}
            onOffset={setSubtitleOffset}
            onPick={(t) => {
              void selectTrack(t);
              setSubtitlePickerOpen(false);
            }}
            onOff={() => {
              void selectTrack(null);
              setSubtitlePickerOpen(false);
            }}
            onRetry={() => {
              setTracks(null);
              void loadCaptions();
            }}
          />
        </PickerSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  chromeWrap: { ...StyleSheet.absoluteFillObject },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.md },
  bufferLabel: { color: palette.textSecondary, fontSize: 13 },
  subtitleOverlay: { position: "absolute", left: spacing.xxl, right: spacing.xxl, alignItems: "center" },
  subtitleText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
    backgroundColor: "rgba(8,10,13,0.45)",
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    overflow: "hidden",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,10,13,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  errorTitle: { fontSize: 20, fontWeight: "800", color: palette.textPrimary },
  errorMessage: { color: palette.textSecondary, textAlign: "center", marginBottom: spacing.sm, lineHeight: 21 },
  errorBtn: {
    backgroundColor: "rgba(244,242,237,0.10)",
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  errorBtnText: { color: palette.textPrimary, fontWeight: "800", fontSize: 14 },
  pickerNote: { color: palette.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.xs },
});
