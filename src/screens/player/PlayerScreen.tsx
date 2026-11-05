import { motion, springs } from "@/design-system/motion";
import { palette, spacing } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { pickAdaptiveSource, shouldDownshift } from "@/services/player/playbackPolicy";
import { prefetchStreams, takePrefetched } from "@/services/provider/prefetch";
import { AppState, PanResponder } from "react-native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { PROVIDER_MEDIA_HEADERS } from "@/services/provider/client";
import { classifyPlayerError, playerErrorMessage, PlayerErrorKind } from "@/services/player/classify";
import { PlayerControls } from "./PlayerControls";
import { NativeTracksOptions, PickerSheet, QualityOptions, SpeedOptions, SubtitleOptions } from "./PickerSheets";
import { pickRecoverySource, qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { cueAt, parseSubtitles, Cue } from "@/services/subtitles/srt";
import { loadCues, pickPreferredTrack, saveCues, subtitleKey } from "@/services/subtitles/cache";
import { useLibrary, COMPLETION_THRESHOLD } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { CaptionTrack, StreamSource } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import type { AudioTrack, SubtitleTrack } from "expo-video";
import { isPictureInPictureSupported, useVideoPlayer, VideoView, VideoSource } from "expo-video";
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
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt, nextEpisode } = route.params;
  const { saveProgress } = useLibrary();
  const { play } = useSound();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const isTV = stage.remote;
  const videoRef = useRef<VideoView>(null);
  const chromeY = useRef(new Animated.Value(0)).current;
  const chromeFocusCount = useRef(0);
  const stallTimesRef = useRef<number[]>([]);
  const holdRateRef = useRef(1);
  const autoNextCancelledRef = useRef(false);
  const autoSubtitleRef = useRef(false);
  const subtitleOptOutRef = useRef(false);
  const pressZoneRef = useRef<"left" | "center" | "right">("center");
  const gestureStartRef = useRef({ x: 0, position: 0 });
  const lastTapRef = useRef<{ at: number; zone: "left" | "center" | "right" } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  const [gestureHint, setGestureHint] = useState<string | null>(null);
  const [subtitleScale, setSubtitleScale] = useState(1);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [cinemaMode, setCinemaMode] = useState(() => stage.remote);
  const [locked, setLocked] = useState(false);
  const [pipSupported] = useState(() => {
    try {
      return isPictureInPictureSupported();
    } catch {
      return false;
    }
  });

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
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const requestSeqRef = useRef(0);
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });
  const lastSavedRef = useRef(0);
  const captionAbortRef = useRef<AbortController | null>(null);
  const captionSeqRef = useRef(0);
  const episodeKey = `${subjectId}|${detailPath}|${season}|${episode}`;
  const cueKey = subtitleKey(subjectId, season, episode);
  const lastEpisodeKeyRef = useRef(episodeKey);

  const startAt = Math.max(0, resumeAt);

  // `useVideoPlayer` releases the native player as its own unmount cleanup, and
  // that cleanup runs before the effects declared below it. Anything that runs
  // on the way out must therefore read these snapshots instead of the player,
  // otherwise it touches an already-released shared object and crashes.
  const mountedRef = useRef(true);
  const positionRef = useRef(startAt);
  const durationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialSource = useMemo(() => (source ? videoSourceFor(source) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useVideoPlayer(initialSource, (p) => {
    p.timeUpdateEventInterval = 0.25;
    // Buffer for a real network: keep a runway, but start fast.
    p.bufferOptions = { preferredForwardBufferDuration: 24, minBufferForPlayback: 2 };
    p.currentTime = startAt;
    if (initialSource) {
      p.playbackRate = 1;
      p.play();
    }
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

  const showError = useCallback(
    (kind: PlayerErrorKind, detail?: string | null) => {
      play("error");
      setStatus("error");
      setBuffering(false);
      setFailMessage(detail ?? playerErrorMessage(kind));
    },
    [play],
  );

  /** Replace the native player's source while preserving playback position. */
  const applySource = useCallback(
    async (next: StreamSource, at: number) => {
      if (!mountedRef.current) return;
      const seq = ++requestSeqRef.current;
      setSource(next);
      sourceRef.current = next;
      recoveryRef.current.triedUrls.add(next.url);
      setStatus("loading");
      setBuffering(true);
      setFailMessage(null);
      try {
        await player.replaceAsync(videoSourceFor(next));
        if (seq !== requestSeqRef.current || !mountedRef.current) return;
        player.currentTime = Math.max(0, at);
        player.playbackRate = rateRef.current;
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
      const at = positionRef.current;
      state.triedUrls.add(current.url);
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const now = Date.now();
        stallTimesRef.current = stallTimesRef.current.filter((at) => now - at <= 90_000);
        const downshift = shouldDownshift(stallTimesRef.current, now);
        const picked =
          (downshift ? pickAdaptiveSource(res.sources, current.resolution, 1) : null) ??
          pickRecoverySource(res.sources, state.triedUrls, current.resolution);
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
    autoNextCancelledRef.current = false;
    autoSubtitleRef.current = false;
    subtitleOptOutRef.current = false;
    setNextCountdown(null);
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

  // Route params may arrive with no sources ("Next episode" handoff): resolve
  // them here through the standard Zarhosting endpoint, same as Details does.
  useEffect(() => {
    if (sources.length > 0 || !detailPath) return;
    setStatus("loading");
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, null);
        if (!picked) throw new Error("empty");
        recoveryRef.current = { attempts: 0, triedUrls: new Set(), running: false };
        await applySource(picked, 0);
      } catch {
        showError("empty_response", "The next episode could not be opened. Try again from its details page.");
      }
    })();
  }, [sources, subjectId, detailPath, season, episode, applySource, showError]);

  /** Snapshot the stream's own audio/subtitle tracks from expo-video. */
  const refreshNativeTracks = useCallback(() => {
    try {
      setNativeAudioTracks([...player.availableAudioTracks]);
      setNativeSubtitleTracks([...player.availableSubtitleTracks]);
      setNativeAudioId(player.audioTrack?.id ?? null);
      setNativeSubtitleId(player.subtitleTrack?.id ?? null);
    } catch {
      // Track selection is a bonus; never break playback over it.
    }
  }, [player]);

  useEffect(() => {
    setBuffering(statusChange.status === "loading");
    if (statusChange.status === "readyToPlay") {
      setStatus("ready");
      setFailMessage(null);
      refreshNativeTracks();
      return;
    }
    if (statusChange.status === "error") {
      const kind = classifyPlayerError(statusChange.error?.message ?? "");
      void recover(kind, null);
    }
  }, [statusChange, recover, refreshNativeTracks]);

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
      if (sourceRef.current) {
        stallTimesRef.current.push(Date.now());
        void recover("buffering_timeout", null);
      }
    }, BUFFER_STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [buffering, status, recover]);

  // Progress + subtitle clock. Persist locally every 10s of playback.
  useEffect(() => {
    const t = timeUpdate?.currentTime ?? position;
    const d = player.duration;
    positionRef.current = t;
    if (d > 0) durationRef.current = d;
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

  // Warm the next episode while this one is still playing.
  useEffect(() => {
    if (!nextEpisode || duration <= 0) return;
    if (position / duration < 0.8) return;
    prefetchStreams(subjectId, detailPath, nextEpisode.season, nextEpisode.episode);
  }, [nextEpisode, duration, position, subjectId, detailPath]);

  // Save on unmount.
  const saveOnExitRef = useRef<() => void>(() => {});
  saveOnExitRef.current = () => {
    const t = positionRef.current;
    const d = durationRef.current;
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
  useEffect(
    () => () => {
      try {
        saveOnExitRef.current();
      } catch {
        // Saving progress is best effort; never let it break navigation.
      }
    },
    [],
  );
  useEffect(() => () => captionAbortRef.current?.abort(), []);

  // Leaving the app pauses playback (unless picture-in-picture is active).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && !pipActive) player.pause();
    });
    return () => sub.remove();
  }, [player, pipActive]);

  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
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
        void saveCues(cueKey, parsed);
      } catch {
        if (seq !== captionSeqRef.current) return;
        // Offline, or a dead track URL: replay the cached cues instead.
        const cached = await loadCues(cueKey);
        if (cached && seq === captionSeqRef.current) {
          setCues(cached);
          return;
        }
        if (seq !== captionSeqRef.current) return;
        setActiveTrack(null);
        setTracksError("This subtitle track could not be loaded.");
      }
    },
    [cueKey],
  );

  // Subtitles arrive on their own: fetch the list, then pick a track.
  useEffect(() => {
    if (status !== "ready" || tracks !== null || tracksLoading) return;
    if (subtitleOptOutRef.current) return;
    void loadCaptions();
  }, [status, tracks, tracksLoading, loadCaptions]);

  useEffect(() => {
    if (autoSubtitleRef.current || !tracks || tracks.length === 0) return;
    if (subtitleOptOutRef.current || activeTrack || nativeSubtitleId) return;
    autoSubtitleRef.current = true;
    const preferred = pickPreferredTrack(tracks);
    if (preferred) void selectTrack(preferred);
  }, [tracks, activeTrack, nativeSubtitleId, selectTrack]);

  // No tracks from the provider (offline, or a title that lost its captions):
  // fall back to the subtitles cached from the last online playback.
  useEffect(() => {
    if (tracks === null || tracks.length > 0 || activeTrack) return;
    if (subtitleOptOutRef.current) return;
    let cancelled = false;
    void (async () => {
      const cached = await loadCues(cueKey);
      if (cancelled || !cached) return;
      setCues(cached);
      setActiveTrack({ id: "cached", language: "cached", languageName: "Cached", url: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [tracks, activeTrack, cueKey]);

  // Embedded tracks: choose the English one when the stream ships subtitles.
  useEffect(() => {
    if (subtitleOptOutRef.current || nativeSubtitleId || nativeSubtitleTracks.length === 0) return;
    const preferred =
      nativeSubtitleTracks.find((t) => /english|^en\b/i.test(`${t.language ?? ""} ${t.label ?? ""}`)) ??
      nativeSubtitleTracks[0];
    if (!preferred) return;
    try {
      player.subtitleTrack = preferred;
      setNativeSubtitleId(preferred.id);
    } catch {
      // Embedded selection is best-effort.
    }
  }, [nativeSubtitleTracks, nativeSubtitleId, player]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    Animated.parallel([
      Animated.timing(controlsOpacity, { toValue: 1, duration: motion.fast, useNativeDriver: true }),
      Animated.spring(chromeY, { toValue: 0, useNativeDriver: true, ...springs.chrome }),
    ]).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!mountedRef.current) return;
      // Never vanish while the remote is on the chrome.
      if (player.playing && chromeFocusCount.current === 0) {
        Animated.parallel([
          Animated.timing(controlsOpacity, { toValue: 0, duration: motion.normal, useNativeDriver: true }),
          Animated.timing(chromeY, { toValue: 64, duration: motion.normal, useNativeDriver: true }),
        ]).start(() => setControlsVisible(false));
      }
    }, 3400);
  }, [player, controlsOpacity, chromeY]);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  const skip = useCallback(
    (seconds: number) => {
      const max = player.duration > 0 ? player.duration : player.currentTime + seconds;
      const next = Math.max(0, Math.min(max, player.currentTime + seconds));
      player.currentTime = next;
      positionRef.current = next;
      setPosition(next);
      showControls();
    },
    [player, showControls],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  /** Gestures: double-tap a side to seek, double-tap centre to play/pause, hold for 2×. */
  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, state) => Math.abs(state.dx) > 10 || Math.abs(state.dy) > 10,
        onPanResponderGrant: (event) => {
          const x = event.nativeEvent.pageX;
          gestureStartRef.current = { x, position: positionRef.current };
          pressZoneRef.current = x < stage.width * 0.34 ? "left" : x > stage.width * 0.66 ? "right" : "center";
          holdRateRef.current = rateRef.current;
          longPressActiveRef.current = false;
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          // Hold the right side for a temporary 2×; letting go returns to normal.
          if (pressZoneRef.current === "right" && player.playing) {
            longPressTimerRef.current = setTimeout(() => {
              if (!mountedRef.current) return;
              longPressActiveRef.current = true;
              player.playbackRate = 2;
              setRate(2);
              setGestureHint("2× · release to resume");
            }, 420);
          }
        },
        onPanResponderRelease: (_event, state) => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          if (longPressActiveRef.current) {
            longPressActiveRef.current = false;
            player.playbackRate = holdRateRef.current;
            setRate(holdRateRef.current);
            setGestureHint(null);
            return;
          }
          if (Math.abs(state.dx) > 54 && Math.abs(state.dx) > Math.abs(state.dy) * 1.3) {
            const seekBy = Math.round((state.dx / Math.max(stage.width, 1)) * Math.min(Math.max(duration, 90), 300));
            const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, gestureStartRef.current.position + seekBy));
            player.currentTime = target;
            positionRef.current = target;
            setPosition(target);
            setGestureHint(`${seekBy >= 0 ? "+" : "−"}${Math.abs(seekBy)} seconds`);
            showControls();
            setTimeout(() => setGestureHint(null), 900);
            return;
          }
          if (Math.abs(state.dx) > 12 || Math.abs(state.dy) > 12) return;

          // Use the zone captured on touch-down: release coordinates are unreliable on Android.
          const zone = pressZoneRef.current;
          const now = Date.now();
          const last = lastTapRef.current;

          if (last && last.zone === zone && now - last.at <= 320) {
            lastTapRef.current = null;
            if (tapTimerRef.current) {
              clearTimeout(tapTimerRef.current);
              tapTimerRef.current = null;
            }
            if (zone === "left") {
              skip(-10);
              setGestureHint("− 10 seconds");
            } else if (zone === "right") {
              skip(10);
              setGestureHint("+ 10 seconds");
            } else {
              togglePlay();
              setGestureHint("Play / pause");
            }
            setTimeout(() => setGestureHint(null), 650);
            return;
          }

          lastTapRef.current = { at: now, zone };
          if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
          // First tap responds immediately; a second one upgrades it to a seek.
          showControls();
        },
        onPanResponderTerminate: () => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          if (longPressActiveRef.current) {
            longPressActiveRef.current = false;
            player.playbackRate = holdRateRef.current;
            setRate(holdRateRef.current);
          }
        },
      }),
    [player, skip, stage.width, togglePlay, showControls],
  );

  const setPlaybackRate = useCallback(
    (next: number) => {
      player.playbackRate = next;
      setRate(next);
      setSpeedPickerOpen(false);
      showControls();
    },
    [player, showControls],
  );

  const pickNativeAudio = useCallback(
    (t: AudioTrack | null) => {
      try {
        player.audioTrack = t;
        setNativeAudioId(t?.id ?? null);
      } catch {}
      setSubtitlePickerOpen(false);
    },
    [player],
  );

  const pickNativeSubtitle = useCallback(
    (t: SubtitleTrack | null) => {
      try {
        player.subtitleTrack = t;
        setNativeSubtitleId(t?.id ?? null);
      } catch {}
      setSubtitlePickerOpen(false);
    },
    [player],
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
      sources: takePrefetched(subjectId, detailPath, nextEpisode.season, nextEpisode.episode)?.sources ?? [],
      nextEpisode: nextEpisode.season === season ? { season, episode: nextEpisode.episode + 1 } : null,
    });
  }, [navigation, subjectId, detailPath, title, mediaType, season, nextEpisode, route.params.posterUrl]);

  // Up-next card: eight seconds, cancellable, only near the very end.
  useEffect(() => {
    if (!nextEpisode || status !== "ready" || duration <= 0) return;
    if (autoNextCancelledRef.current) return;
    if (nextCountdown !== null) return;
    if (position / duration < 0.94) return;
    setNextCountdown(8);
  }, [nextEpisode, status, duration, position, nextCountdown]);

  useEffect(() => {
    if (nextCountdown === null) return;
    if (!isPlaying) return;
    if (nextCountdown <= 0) {
      setNextCountdown(null);
      goNextEpisode();
      return;
    }
    const timer = setTimeout(() => setNextCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [nextCountdown, goNextEpisode, isPlaying]);

  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
      void applySource(next, positionRef.current);
    },
    [applySource, player],
  );

  /** Manual retry always resolves a fresh direct URL (offline files are reused). */
  const retry = useCallback(() => {
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    const current = sourceRef.current;
    const at = positionRef.current;
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
      <View style={StyleSheet.absoluteFill} {...(locked || pipActive ? {} : gesture.panHandlers)}>
        <VideoView
          ref={videoRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={fitMode}
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={pipSupported && !stage.remote}
          onPictureInPictureStart={() => {
            setPipActive(true);
            setControlsVisible(false);
          }}
          onPictureInPictureStop={() => {
            setPipActive(false);
            showControls();
          }}
        />
      </View>

      {cinemaMode && !pipActive ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cinemaShade]} />
      ) : null}

      {activeTrack && currentCue ? (
        <View
          style={[styles.subtitleOverlay, { bottom: controlsVisible ? stage.subtitleSize * 5.4 : stage.subtitleSize * 2.4 }]}
          pointerEvents="none"
        >
          <Text style={[styles.subtitleText, { fontSize: stage.subtitleSize * subtitleScale }]}>{currentCue.text}</Text>
        </View>
      ) : null}

      {gestureHint ? (
        <View style={styles.gestureHint} pointerEvents="none">
          <Text style={styles.gestureHintText}>{gestureHint}</Text>
        </View>
      ) : null}

      {nextCountdown !== null && status !== "error" ? (
        <View style={[styles.nextCard, { right: stage.gutter, bottom: stage.subtitleSize * 6.4 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextLabel}>Next episode</Text>
            <Text style={styles.nextCount}>Starts in {nextCountdown}s</Text>
          </View>
          <Pressable
            style={styles.nextPlay}
            onPress={goNextEpisode}
            accessibilityRole="button"
            accessibilityLabel="Play next episode now"
          >
            <Text style={styles.nextPlayText}>Play now</Text>
          </Pressable>
          <Pressable
            style={styles.nextCancel}
            onPress={() => {
              autoNextCancelledRef.current = true;
              setNextCountdown(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel next episode"
          >
            <Text style={styles.nextCancelText}>Cancel</Text>
          </Pressable>
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
            <Text style={[styles.errorBtnText, { color: "#160B08" }]}>Retry</Text>
          </Pressable>
          <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.errorBtnText}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      {locked ? (
        <Pressable
          style={styles.lockedPill}
          onPress={() => {
            setLocked(false);
            showControls();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock controls"
        >
          <Text style={styles.lockedText}>Locked · tap to unlock</Text>
        </Pressable>
      ) : null}

      {controlsVisible && status !== "error" && !pipActive && !locked ? (
        <Animated.View
          style={[styles.chromeWrap, { opacity: controlsOpacity, transform: [{ translateY: chromeY }] }]}
          pointerEvents="box-none"
        >
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
            fitMode={fitMode}
            pipAvailable={pipSupported}
            cinemaMode={cinemaMode}
            onToggleCinema={() => setCinemaMode((value) => !value)}
            stage={stage}
            onFocusChange={(focused) => {
              chromeFocusCount.current = focused ? 1 : 0;
              if (!focused) showControls();
            }}
            onTogglePlay={togglePlay}
            onSkip={skip}
            onSeek={(t) => {
              player.currentTime = t;
              positionRef.current = t;
              setPosition(t);
              showControls();
            }}
            onBack={() => navigation.goBack()}
            onQuality={() => {
              chromeFocusCount.current = 0;
              setQualityPickerOpen(true);
            }}
            onSubtitles={() => {
              chromeFocusCount.current = 0;
              refreshNativeTracks();
              void loadCaptions();
              setSubtitlePickerOpen(true);
            }}
            onSpeed={() => {
              chromeFocusCount.current = 0;
              setSpeedPickerOpen(true);
            }}
            onNextEpisode={goNextEpisode}
            onToggleFit={() => setFitMode((mode) => (mode === "contain" ? "cover" : "contain"))}
            onPictureInPicture={() => {
              if (!mountedRef.current || !videoRef.current) return;
              if (!player.playing) player.play();
              void videoRef.current?.startPictureInPicture().catch(() => {
                setGestureHint("Picture-in-picture isn't available here");
                setTimeout(() => setGestureHint(null), 1800);
              });
            }}
            onLock={() => {
              Animated.timing(controlsOpacity, { toValue: 0, duration: motion.fast, useNativeDriver: true }).start(() => {
                setControlsVisible(false);
                setLocked(true);
              });
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
            scale={subtitleScale}
            onScale={setSubtitleScale}
            onPick={(t) => {
              if (nativeSubtitleId) pickNativeSubtitle(null);
              void selectTrack(t);
              setSubtitlePickerOpen(false);
            }}
            onOff={() => {
              subtitleOptOutRef.current = true;
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  cinemaShade: { backgroundColor: "rgba(0, 0, 0, 0.22)" },
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
  gestureHint: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    backgroundColor: "rgba(8,10,13,0.82)",
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  gestureHintText: { color: palette.textPrimary, fontSize: 14, fontWeight: "700" },
  lockedPill: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(8,10,13,0.82)",
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  lockedText: { color: palette.textPrimary, fontSize: 13, fontWeight: "700" },
  nextCard: {
    position: "absolute",
    minWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(16,21,27,0.92)",
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
  },
  nextLabel: { color: palette.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  nextCount: { color: palette.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 2 },
  nextPlay: { backgroundColor: palette.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  nextPlayText: { color: "#160B08", fontWeight: "800", fontSize: 12 },
  nextCancel: { paddingHorizontal: 6, paddingVertical: 8 },
  nextCancelText: { color: palette.textSecondary, fontSize: 12, fontWeight: "700" },
});
