import { chrome } from "@/design-system/gradients";
import { materials } from "@/design-system/materials";
import { palette, spacing } from "@/design-system/tokens";
import { Platform } from "react-native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { PROVIDER_MEDIA_HEADERS } from "@/services/provider/client";
import { classifyPlayerError, playerErrorMessage, PlayerErrorKind } from "@/services/player/classify";
import { PlayerControls } from "./PlayerControls";
import { PlayerBoundary } from "@/components/ui/PlayerBoundary";
import { PlayerGuard, episodeKeyOf } from "@/services/player/lifecycle";
import { CONTROLS_IDLE_MS } from "@/design-system/motion";
import { NativeTracksOptions, PickerSheet, QualityOptions, SpeedOptions, SubtitleOptions } from "./PickerSheets";
import { pickRecoverySource, qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { cueAt, parseSubtitles, Cue } from "@/services/subtitles/srt";
import { useLibrary, COMPLETION_THRESHOLD } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { CaptionTrack, StreamSource } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import type { AudioTrack, SubtitleTrack } from "expo-video";
import { useVideoPlayer, VideoView, VideoSource } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_RECOVERY_ATTEMPTS = 4;
/**
 * A real, tiny, always-available local URI used only to construct the player.
 * The first real source replaces it immediately. Using a local asset avoids a
 * native player created around a null/undefined source.
 */
const OFFLINE_PLACEHOLDER_URI = "file:///android_asset/placeholder.mp4";
const BUFFER_STALL_TIMEOUT_MS = 30_000;

function isOfflineUri(uri: string): boolean {
  return /^(file|content|ph|assets-library):/i.test(uri);
}

function videoSourceFor(source: StreamSource): VideoSource {
  return isOfflineUri(source.url) ? { uri: source.url } : { uri: source.url, headers: { ...PROVIDER_MEDIA_HEADERS } };
}

function PlayerScreenInner() {
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const navigation = useNavigation<Nav>();
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt, nextEpisode } = route.params;
  const { saveProgress } = useLibrary();
  const { play } = useSound();
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
  const [rate, setRate] = useState(1);
  const [speedPickerOpen, setSpeedPickerOpen] = useState(false);
  const [nativeAudioTracks, setNativeAudioTracks] = useState<AudioTrack[]>([]);
  const [nativeSubtitleTracks, setNativeSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [nativeAudioId, setNativeAudioId] = useState<string | null>(null);
  const [nativeSubtitleId, setNativeSubtitleId] = useState<string | null>(null);
  const [stallSeconds, setStallSeconds] = useState(0);
  const [pipActive, setPipActive] = useState(false);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while a control inside the chrome has focus (TV keeps it visible). */
  const focusHeldRef = useRef(false);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const requestSeqRef = useRef(0);
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });
  const lastSavedRef = useRef(0);
  const captionAbortRef = useRef<AbortController | null>(null);
  const captionSeqRef = useRef(0);
  const episodeKey = episodeKeyOf({ subjectId, detailPath, season, episode });
  const lastEpisodeKeyRef = useRef(episodeKey);

  const startAt = Math.max(0, resumeAt);

  const showError = useCallback(
    (kind: PlayerErrorKind, detail?: string | null) => {
      play("error");
      setStatus("error");
      setBuffering(false);
      setFailMessage(detail ?? playerErrorMessage(kind));
    },
    [play],
  );

  /**
   * ONE player for the whole screen lifetime.
   *
   * `useVideoPlayer` keys its shared object on the source it was created with.
   * Passing a source that changes (which the previous implementation did through
   * a mount-time memo plus late-arriving route params) makes expo-video release
   * the old player and build a new one, detaching every event subscription the
   * screen already registered — the root of the released-object crash.
   *
   * The player is created with a placeholder and the first real source is
   * applied through `replaceAsync`, so the object identity never changes and no
   * subscription can be left pointing at a freed handle.
   */
  const initialUri = useMemo(() => (source ? source.url : OFFLINE_PLACEHOLDER_URI), []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialHeaders = useMemo(() => (source && !isOfflineUri(source.url) ? { ...PROVIDER_MEDIA_HEADERS } : undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useVideoPlayer({ uri: initialUri, headers: initialHeaders }, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.muted = true;
  });

  /**
   * Every native touch goes through the guard. Anything that was awaiting when
   * the screen unmounted (recovery, retry, quality switch, next episode, the
   * buffering watchdog, caption loading) is dropped instead of touching a
   * released player.
   */
  const guardRef = useRef(new PlayerGuard());
  const guard = guardRef.current;
  const mountedRef = useRef(true);

  const alive = useCallback(() => guard.isReleased === false && mountedRef.current, [guard]);

  const playing = useEvent(player, "playingChange", { isPlaying: false });
  const statusChange = useEvent(player, "statusChange", { status: "loading" as const, error: undefined });
  const timeUpdate = useEvent(player, "timeUpdate", {
    currentTime: startAt,
    currentLiveTimestamp: null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });

  const offline = source ? isOfflineUri(source.url) : false;

  // Apply the real source once the screen has mounted. Replacing (never
  // recreating) keeps the player object and its listeners stable.
  const initialAppliedRef = useRef(false);
  /** One recovery cycle per underlying error; reset when a source is applied. */
  const errorHandledRef = useRef(false);
  useEffect(() => {
    if (initialAppliedRef.current || !source) return;
    initialAppliedRef.current = true;
    const at = Math.max(0, resumeAt);
    void (async () => {
      const token = guard.token();
      try {
        // If the player was constructed with this exact URL there is nothing to
        // replace — just start it. Re-replacing the same source would trigger a
        // redundant network load and a visible re-buffer at launch.
        if (source.url === initialUri) {
          if (!guard.isCurrent(token)) return;
          player.muted = false;
          player.currentTime = at;
          player.playbackRate = 1;
          player.play();
          return;
        }
        await player.replaceAsync(videoSourceFor(source));
        if (!guard.isCurrent(token)) return;
        player.muted = false;
        player.currentTime = at;
        player.playbackRate = 1;
        player.play();
      } catch {
        if (!guard.isCurrent(token)) return;
        showError("format", null);
      }
    })();
  }, [source, resumeAt, player, guard, showError]);
  const qualityList = useMemo(() => qualityOptions(availableSources), [availableSources]);

  useEffect(() => {
    setIsPlaying(playing.isPlaying);
    if (playing.isPlaying) setBuffering(false);
  }, [playing]);

  /** Replace the native player's source while preserving playback position. */
  const applySource = useCallback(
    async (next: StreamSource, at: number) => {
      if (!alive()) return;
      const seq = ++requestSeqRef.current;
      const token = guard.token();
      setSource(next);
      sourceRef.current = next;
      recoveryRef.current.triedUrls.add(next.url);
      setStatus("loading");
      setBuffering(true);
      setFailMessage(null);
      errorHandledRef.current = false;
      try {
        await player.replaceAsync(videoSourceFor(next));
        // The screen may have unmounted (or the source been superseded) while
        // the native replace was in flight — touching the player now is exactly
        // what produced the "already released" crash.
        if (seq !== requestSeqRef.current || !guard.isCurrent(token) || !alive()) return;
        initialAppliedRef.current = true;
        player.muted = false;
        player.currentTime = Math.max(0, at);
        player.playbackRate = rateRef.current;
        player.play();
      } catch (err) {
        if (seq !== requestSeqRef.current || !guard.isCurrent(token) || !alive()) return;
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    },
    [player, showError, guard, alive],
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
      const at = guard.use((p) => p.currentTime, player) ?? 0;
      state.triedUrls.add(current.url);
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        if (!alive()) return;
        setAvailableSources(res.sources);
        const picked = pickRecoverySource(res.sources, state.triedUrls, current.resolution);
        if (!picked) {
          showError(kind, detail ?? playerErrorMessage(kind));
          return;
        }
        await applySource(picked, at);
      } catch (err) {
        if (!alive()) return;
        const nested = classifyPlayerError(err instanceof Error ? err.message : "");
        showError(kind, playerErrorMessage(nested === "unknown" ? kind : nested));
      } finally {
        state.running = false;
      }
    },
    [player, subjectId, detailPath, season, episode, applySource, showError, guard, alive],
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
    // With no sources on the route, the resolve effect below fetches them.
    // Showing "no source" here would flash an error before that request returns.
    if (next) void applySource(next, resumeAt);
  }, [episodeKey, sources, resumeAt, applySource, guard, alive]);

  // Route params may arrive with no sources ("Next episode" handoff): resolve
  // them here through the standard Zarhosting endpoint, same as Details does.
  useEffect(() => {
    if (sources.length > 0 || !detailPath) return;
    setStatus("loading");
    const token = guard.token();
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        if (!alive() || !guard.isCurrent(token)) return;
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, null);
        if (!picked) throw new Error("empty");
        recoveryRef.current = { attempts: 0, triedUrls: new Set(), running: false };
        await applySource(picked, Math.max(0, resumeAt));
      } catch {
        if (!alive() || !guard.isCurrent(token)) return;
        showError("empty_response", "This episode could not be opened. Try again from the details page.");
      }
    })();
  }, [sources, subjectId, detailPath, season, episode, applySource, showError, resumeAt, guard, alive]);

  /** Snapshot the stream's own audio/subtitle tracks from expo-video. */
  const refreshNativeTracks = useCallback(() => {
    // Track selection is a bonus; never break playback over it.
    guard.use((p) => {
      setNativeAudioTracks([...p.availableAudioTracks]);
      setNativeSubtitleTracks([...p.availableSubtitleTracks]);
      setNativeAudioId(p.audioTrack?.id ?? null);
      setNativeSubtitleId(p.subtitleTrack?.id ?? null);
    }, player);
  }, [player, guard]);

  useEffect(() => {
    if (!alive()) return;
    setBuffering(statusChange.status === "loading");
    if (statusChange.status === "readyToPlay") {
      setStatus("ready");
      setFailMessage(null);
      refreshNativeTracks();
      return;
    }
    if (statusChange.status === "error") {
      // Before the real source is applied the player is sitting on the local
      // placeholder. Its failure (if any) must never be reported as a stream
      // error — that would show "Playback problem" before we even started.
      // Once a real source is live, the same flag guards against duplicate
      // reports: recovery may legitimately fail, and it must not be retried
      // repeatedly for one underlying error.
      if (!initialAppliedRef.current || errorHandledRef.current) return;
      errorHandledRef.current = true;
      const kind = classifyPlayerError(statusChange.error?.message ?? "");
      void recover(kind, null);
    }
  }, [statusChange, recover, refreshNativeTracks, alive]);

  // Live countdown while buffering, so a stall is visible instead of silent.
  useEffect(() => {
    if (!buffering || status === "error") {
      setStallSeconds(0);
      return;
    }
    setStallSeconds(0);
    const tick = setInterval(() => setStallSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [buffering, status]);

  useEffect(() => {
    if (!buffering || status === "error") return;
    const t = setTimeout(() => {
      if (sourceRef.current) void recover("buffering_timeout", null);
    }, BUFFER_STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [buffering, status, recover]);

  // Progress + subtitle clock. Persist locally every 10s of playback.
  useEffect(() => {
    if (!alive()) return;
    const t = timeUpdate?.currentTime ?? position;
    const d = guard.use((p) => p.duration, player) ?? 0;
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
  }, [timeUpdate, player, activeTrack, cues, subtitleOffset, subjectId, detailPath, mediaType, title, season, episode, saveProgress, route.params.posterUrl, guard, alive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeTrack || !alive()) return;
    const now = guard.use((p) => p.currentTime, player);
    if (now == null) return;
    setCurrentCue(cueAt(cues, now * 1000, subtitleOffset * 1000));
  }, [cues, subtitleOffset, activeTrack, player, guard, alive]);

  // Save on unmount.
  const saveOnExitRef = useRef<() => void>(() => {});
  saveOnExitRef.current = () => {
    const t = guard.use((p) => p.currentTime, player) ?? 0;
    const d = guard.use((p) => p.duration, player) ?? 0;
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
  /**
   * Unmount sequence matters. Order:
   *  1. persist where we stopped (player still alive),
   *  2. stop all our timers,
   *  3. abort in-flight caption work,
   *  4. mark the guard released LAST so anything that was already awaiting a
   *     native call bails out instead of touching a released object.
   */
  useEffect(
    () => () => {
      saveOnExitRef.current();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      captionAbortRef.current?.abort();
      mountedRef.current = false;
      guardRef.current.release();
    },
    [],
  );

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
    if (!alive()) return;
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // On TV the controls only hide while the video is actually playing AND
      // nothing inside the chrome holds focus. Hiding them under a focused
      // button would strand the remote with no visible target.
      const playing = guard.use((p) => p.playing, player) ?? false;
      if (playing && !focusHeldRef.current) {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
          if (alive()) setControlsVisible(false);
        });
      }
    }, CONTROLS_IDLE_MS);
  }, [player, controlsOpacity, guard, alive]);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  const skip = useCallback(
    (seconds: number) => {
      guard.use((p) => {
        const duration = p.duration;
        const now = p.currentTime;
        const max = duration > 0 ? duration : now + seconds;
        p.currentTime = Math.max(0, Math.min(max, now + seconds));
      }, player);
      showControls();
    },
    [player, showControls, guard],
  );

  const togglePlay = useCallback(() => {
    guard.use((p) => {
      if (p.playing) p.pause();
      else p.play();
    }, player);
    showControls();
  }, [player, showControls, guard]);

  const setPlaybackRate = useCallback(
    (next: number) => {
      guard.use((p) => {
        p.playbackRate = next;
      }, player);
      setRate(next);
      setSpeedPickerOpen(false);
      showControls();
    },
    [player, showControls, guard],
  );

  const pickNativeAudio = useCallback(
    (t: AudioTrack | null) => {
      guard.use((p) => {
        p.audioTrack = t;
      }, player);
      setNativeAudioId(t?.id ?? null);
      setSubtitlePickerOpen(false);
    },
    [player, guard],
  );

  const pickNativeSubtitle = useCallback(
    (t: SubtitleTrack | null) => {
      guard.use((p) => {
        p.subtitleTrack = t;
      }, player);
      setNativeSubtitleId(t?.id ?? null);
      setSubtitlePickerOpen(false);
    },
    [player, guard],
  );

  const goNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    navigation.replace("Player", {
      subjectId,
      detailPath,
      title,
      posterUrl: route.params.posterUrl,
      mediaType,
      season: nextEpisode.season,
      episode: nextEpisode.episode,
      resumeAt: 0,
      sources: [],
      nextEpisode: nextEpisode.season === season ? { season, episode: nextEpisode.episode + 1 } : null,
    });
  }, [navigation, subjectId, detailPath, title, mediaType, season, nextEpisode, route.params.posterUrl]);

  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
      void applySource(next, guard.use((p) => p.currentTime, player) ?? 0);
    },
    [applySource, player, guard],
  );

  /** Manual retry always resolves a fresh direct URL (offline files are reused). */
  const retry = useCallback(() => {
    setFailMessage(null);
    errorHandledRef.current = false;
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    const current = sourceRef.current;
    const at = guard.use((p) => p.currentTime, player) ?? 0;
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
        if (!alive()) return;
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, current.resolution) ?? selectSource(res.sources, null);
        if (!picked) throw new Error("No playable source was returned.");
        await applySource(picked, at);
      } catch (err) {
        if (!alive()) return;
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    })();
  }, [player, subjectId, detailPath, season, episode, applySource, showError, guard, alive]);

  const episodeLabel = mediaType === "series" ? `Season ${season} · Episode ${episode}` : null;

  /**
   * No source yet. This is a normal, transient state for the "next episode"
   * handoff (route params arrive with an empty source list while the resolver
   * works), so it renders the same preparing overlay the player uses instead of
   * flashing a hard error before the request has even returned.
   */
  if (!source) {
    return (
      <View style={styles.root}>
        <View style={styles.centerOverlay}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.bufferLabel}>Finding a playable source…</Text>
        </View>
        <Pressable style={[styles.errorBtn, styles.abortBtn]} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.errorBtnText}>Cancel</Text>
        </Pressable>
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
          allowsPictureInPicture
          onPictureInPictureStart={() => setPipActive(true)}
          onPictureInPictureStop={() => setPipActive(false)}
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
          <Text style={styles.bufferLabel}>
            {offline
              ? "Opening offline file…"
              : stallSeconds >= 5
                ? `Reconnecting… ${Math.max(0, BUFFER_STALL_TIMEOUT_MS / 1000 - stallSeconds)}s`
                : "Preparing stream…"}
          </Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Playback problem</Text>
          <Text style={styles.errorMessage}>{failMessage ?? "Something interrupted this stream."}</Text>
          <Pressable style={[styles.errorBtn, { backgroundColor: palette.accent }]} onPress={retry}>
            <Text style={[styles.errorBtnText, { color: palette.textOnAccent }]}>Retry</Text>
          </Pressable>
          <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.errorBtnText}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      {controlsVisible && status !== "error" && !pipActive ? (
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
            subtitleLabel={nativeSubtitleId ? "Embedded" : activeTrack ? activeTrack.languageName : null}
            rate={rate}
            hasNextEpisode={Boolean(nextEpisode)}
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
              refreshNativeTracks();
              void loadCaptions();
              setSubtitlePickerOpen(true);
            }}
            onSpeed={() => setSpeedPickerOpen(true)}
            onNextEpisode={goNextEpisode}
            onFocusHold={(held) => {
              focusHeldRef.current = held;
              // Keep the chrome alive while the remote is inside it.
              if (held) showControls();
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
        <PickerSheet title="Subtitles & audio" onClose={() => setSubtitlePickerOpen(false)}>
          <NativeTracksOptions
            audioTracks={nativeAudioTracks}
            subtitleTracks={nativeSubtitleTracks}
            activeAudioId={nativeAudioId}
            activeSubtitleId={nativeSubtitleId}
            onPickAudio={pickNativeAudio}
            onPickSubtitle={pickNativeSubtitle}
          />
          <SubtitleOptions
            tracks={tracks}
            loading={tracksLoading}
            error={tracksError}
            activeId={activeTrack?.id ?? null}
            offset={subtitleOffset}
            onOffset={setSubtitleOffset}
            onPick={(t) => {
              if (nativeSubtitleId) pickNativeSubtitle(null);
              void selectTrack(t);
              setSubtitlePickerOpen(false);
            }}
            onOff={() => {
              if (nativeSubtitleId) pickNativeSubtitle(null);
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

      {speedPickerOpen ? (
        <PickerSheet title="Playback speed" onClose={() => setSpeedPickerOpen(false)}>
          <SpeedOptions activeRate={rate} onPick={setPlaybackRate} />
        </PickerSheet>
      ) : null}
    </View>
  );
}

/**
 * The exported screen wraps the player in a local boundary. A fault in the video
 * engine now shows an in-context retry instead of destroying the whole app.
 */
export function PlayerScreen() {
  return (
    <PlayerBoundary>
      <PlayerScreenInner />
    </PlayerBoundary>
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
    backgroundColor: chrome.scrimStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  errorTitle: { fontSize: 20, fontWeight: "800", color: palette.textPrimary },
  errorMessage: { color: palette.textSecondary, textAlign: "center", marginBottom: spacing.sm, lineHeight: 21 },
  errorBtn: {
    backgroundColor: materials.secondary.fill,
    borderColor: materials.secondary.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  errorBtnText: { color: palette.textPrimary, fontWeight: "800", fontSize: 14 },
  pickerNote: { color: palette.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.xs },
  abortBtn: { position: "absolute", bottom: 64, alignSelf: "center" },
});
