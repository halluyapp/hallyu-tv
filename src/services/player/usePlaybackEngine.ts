import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import type { AudioTrack, SubtitleTrack } from "expo-video";
import { isPictureInPictureSupported, useVideoPlayer, type VideoSource } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { IS_TV } from "@/config/appVariant";
import { classifyPlayerError, playerErrorMessage, type PlayerErrorKind } from "@/services/player/classify";
import { pickAdaptiveSource, shouldDownshift } from "@/services/player/playbackPolicy";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { PROVIDER_MEDIA_HEADERS } from "@/services/provider/client";
import { prefetchStreams, takePrefetchedCaptions } from "@/services/provider/prefetch";
import {
  pickRecoverySource,
  qualityOptions,
  selectableSources,
  selectPreferredSource,
} from "@/services/provider/streams";
import { useSound } from "@/services/sound/SoundContext";
import { loadCues, pickPreferredTrack, saveCues, subtitleKey } from "@/services/subtitles/cache";
import { cueAt, parseSubtitles, type Cue } from "@/services/subtitles/srt";
import { COMPLETION_THRESHOLD, useLibrary } from "@/state/LibraryContext";
import { languageMatchTokens, usePreferences } from "@/state/PreferencesContext";
import type { CaptionTrack, StreamSource } from "@/types/provider";

export interface PlaybackRouteParams {
  subjectId: string;
  detailPath: string;
  title: string;
  posterUrl: string | null;
  mediaType: "movie" | "series";
  season: number;
  episode: number;
  maxEpisodesInSeason?: number;
  resumeAt: number;
  sources: StreamSource[];
  nextEpisode?: { season: number; episode: number } | null;
  isTrailer?: boolean;
}

const MAX_RECOVERY_ATTEMPTS = 4;
const BUFFER_STALL_TIMEOUT_MS = 30_000;

export function isOfflineUri(uri: string): boolean {
  return /^(file|content|ph|assets-library):/i.test(uri);
}

export function videoSourceFor(source: StreamSource): VideoSource {
  return isOfflineUri(source.url)
    ? { uri: source.url }
    : { uri: source.url, headers: { ...PROVIDER_MEDIA_HEADERS } };
}

export function usePlaybackEngine(
  params: PlaybackRouteParams,
  onNavigateEpisode?: (season: number, episode: number) => void,
) {
  useKeepAwake();
  const {
    subjectId,
    detailPath,
    title,
    posterUrl,
    mediaType,
    season,
    episode,
    resumeAt,
    sources,
    nextEpisode,
    isTrailer = false,
  } = params;

  const { saveProgress } = useLibrary();
  const { prefs, updatePrefs } = usePreferences();
  const { play } = useSound();

  const [pipSupported] = useState(() => {
    try {
      return isPictureInPictureSupported();
    } catch {
      return false;
    }
  });

  const pickInitial = useCallback(
    (list: StreamSource[]) => {
      if (isTrailer) return list[0] ?? null;
      return selectPreferredSource(list, prefs.preferredQuality, IS_TV);
    },
    [isTrailer, prefs.preferredQuality],
  );

  const [availableSources, setAvailableSources] = useState<StreamSource[]>(sources);
  const [source, setSource] = useState<StreamSource | null>(() => pickInitial(sources));
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failMessage, setFailMessage] = useState<string | null>(null);

  const [tracks, setTracks] = useState<CaptionTrack[] | null>(() =>
    isTrailer ? null : takePrefetchedCaptions(subjectId, detailPath, season, episode),
  );
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<CaptionTrack | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleScale, setSubtitleScaleState] = useState(prefs.subtitleScale);
  const [currentCue, setCurrentCue] = useState<Cue | null>(null);

  const [position, setPosition] = useState(Math.max(0, resumeAt));
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [rate, setRateState] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [stallSeconds, setStallSeconds] = useState(0);
  const [pipActive, setPipActive] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  const [nativeAudioTracks, setNativeAudioTracks] = useState<AudioTrack[]>([]);
  const [nativeSubtitleTracks, setNativeSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [nativeAudioId, setNativeAudioId] = useState<string | null>(null);
  const [nativeSubtitleId, setNativeSubtitleId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const hudActiveRef = useRef(true);
  const positionRef = useRef(Math.max(0, resumeAt));
  const bufferedRef = useRef(0);
  const durationRef = useRef(0);
  const currentCueRef = useRef<Cue | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const requestSeqRef = useRef(0);
  const stallTimesRef = useRef<number[]>([]);
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });
  const lastSavedRef = useRef(0);
  const autoNextCancelledRef = useRef(false);
  const autoSubtitleRef = useRef(false);
  const subtitleOptOutRef = useRef(prefs.preferredSubtitleLang === "off");
  const captionAbortRef = useRef<AbortController | null>(null);
  const captionSeqRef = useRef(0);

  const episodeKey = `${subjectId}|${detailPath}|${season}|${episode}|${isTrailer ? "tr" : "main"}`;
  const cueKey = subtitleKey(subjectId, season, episode);
  const lastEpisodeKeyRef = useRef(episodeKey);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialVideoSource = useMemo(() => (source ? videoSourceFor(source) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useVideoPlayer(initialVideoSource, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.bufferOptions = { preferredForwardBufferDuration: 18, minBufferForPlayback: 1.5 };
    p.currentTime = Math.max(0, resumeAt);
    if (initialVideoSource) {
      p.playbackRate = 1;
      p.play();
    }
  });

  const playingEvent = useEvent(player, "playingChange", { isPlaying: false });
  const statusEvent = useEvent(player, "statusChange", { status: "loading" as const, error: undefined });
  const timeEvent = useEvent(player, "timeUpdate", {
    currentTime: Math.max(0, resumeAt),
    currentLiveTimestamp: null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });

  const offline = source ? isOfflineUri(source.url) : false;
  const qualityList = useMemo(() => qualityOptions(availableSources), [availableSources]);
  const selectableList = useMemo(
    () => (isTrailer ? availableSources : selectableSources(availableSources)),
    [availableSources, isTrailer],
  );

  useEffect(() => {
    setIsPlaying(playingEvent.isPlaying);
    if (playingEvent.isPlaying) setBuffering(false);
  }, [playingEvent]);

  const showError = useCallback(
    (kind: PlayerErrorKind, detail?: string | null) => {
      play("error");
      setStatus("error");
      setBuffering(false);
      setFailMessage(detail ?? playerErrorMessage(kind));
    },
    [play],
  );

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

  const recover = useCallback(
    async (kind: PlayerErrorKind, detail?: string | null) => {
      const state = recoveryRef.current;
      const current = sourceRef.current;
      if (state.running || isTrailer) {
        if (isTrailer) showError(kind, "This trailer stream could not be played right now.");
        return;
      }
      if (!current || isOfflineUri(current.url) || state.attempts >= MAX_RECOVERY_ATTEMPTS) {
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
        stallTimesRef.current = stallTimesRef.current.filter((ts) => now - ts <= 90_000);
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
    [applySource, detailPath, episode, isTrailer, season, showError, subjectId],
  );

  // Episode change reset
  useEffect(() => {
    if (lastEpisodeKeyRef.current === episodeKey) return;
    lastEpisodeKeyRef.current = episodeKey;
    captionAbortRef.current?.abort();
    captionSeqRef.current += 1;
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    lastSavedRef.current = 0;
    autoNextCancelledRef.current = false;
    autoSubtitleRef.current = false;
    subtitleOptOutRef.current = prefs.preferredSubtitleLang === "off";
    setNextCountdown(null);
    setAvailableSources(sources);
    setTracks(isTrailer ? null : takePrefetchedCaptions(subjectId, detailPath, season, episode));
    setActiveTrack(null);
    setCues([]);
    currentCueRef.current = null;
    setCurrentCue(null);
    setTracksError(null);
    setPosition(Math.max(0, resumeAt));
    positionRef.current = Math.max(0, resumeAt);
    bufferedRef.current = 0;
    durationRef.current = 0;
    setDuration(0);

    if (sources.length > 0) {
      const next = pickInitial(sources);
      if (next) void applySource(next, Math.max(0, resumeAt));
      else showError("format", "No playable full-length source was returned for this episode.");
    }
  }, [applySource, episodeKey, pickInitial, prefs.preferredSubtitleLang, resumeAt, showError, sources]);

  // Resolve on arrival when sources array is empty (e.g. Next Episode / Episode Switcher)
  useEffect(() => {
    if (sources.length > 0 || !detailPath || isTrailer) return;
    setStatus("loading");
    let cancelled = false;
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        if (cancelled || !mountedRef.current) return;
        setAvailableSources(res.sources);
        const picked = selectPreferredSource(res.sources, prefs.preferredQuality, IS_TV);
        if (!picked) throw new Error("empty");
        recoveryRef.current = { attempts: 0, triedUrls: new Set(), running: false };
        await applySource(picked, Math.max(0, resumeAt));
      } catch {
        if (!cancelled) {
          showError("empty_response", "This episode could not be opened right now. Try again shortly.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySource, detailPath, episode, isTrailer, prefs.preferredQuality, resumeAt, season, showError, sources, subjectId]);

  const refreshNativeTracks = useCallback(() => {
    try {
      setNativeAudioTracks([...player.availableAudioTracks]);
      setNativeSubtitleTracks([...player.availableSubtitleTracks]);
      setNativeAudioId(player.audioTrack?.id ?? null);
      setNativeSubtitleId(player.subtitleTrack?.id ?? null);
    } catch {}
  }, [player]);

  useEffect(() => {
    setBuffering(statusEvent.status === "loading");
    if (statusEvent.status === "readyToPlay") {
      setStatus("ready");
      setFailMessage(null);
      refreshNativeTracks();
      return;
    }
    if (statusEvent.status === "error") {
      const kind = classifyPlayerError(statusEvent.error?.message ?? "");
      void recover(kind, null);
    }
  }, [recover, refreshNativeTracks, statusEvent]);

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
  }, [buffering, recover, status]);

  const setHudActive = useCallback((visible: boolean) => {
    hudActiveRef.current = visible;
    if (visible) {
      setPosition(positionRef.current);
      setBufferedPosition(bufferedRef.current);
      if (durationRef.current > 0) {
        setDuration(durationRef.current);
      }
    }
  }, []);

  // Time & progress persistence (skips 4Hz scrubber React re-renders while HUD dock is hidden!)
  useEffect(() => {
    const t = timeEvent?.currentTime ?? positionRef.current;
    const b = Math.max(0, timeEvent?.bufferedPosition ?? 0);
    const d = player.duration;
    positionRef.current = t;
    bufferedRef.current = b;
    if (d > 0 && d !== durationRef.current) {
      durationRef.current = d;
      setDuration(d);
    }

    if (hudActiveRef.current) {
      setPosition(t);
      setBufferedPosition(b);
    }

    const nextCue = activeTrack ? cueAt(cues, t * 1000, subtitleOffset * 1000) : null;
    if (
      nextCue?.startMs !== currentCueRef.current?.startMs ||
      nextCue?.text !== currentCueRef.current?.text
    ) {
      currentCueRef.current = nextCue;
      setCurrentCue(nextCue);
    }

    // Warm next episode stream + captions at 80% even when HUD is hidden
    if (!isTrailer && nextEpisode && d > 0 && t / d >= 0.8) {
      prefetchStreams(subjectId, detailPath, nextEpisode.season, nextEpisode.episode);
    }

    // Trigger next-episode countdown at 95% even when HUD is hidden
    if (
      !isTrailer &&
      prefs.autoPlayNext &&
      nextEpisode &&
      onNavigateEpisode &&
      status === "ready" &&
      d > 0 &&
      !autoNextCancelledRef.current &&
      t / d >= 0.95
    ) {
      setNextCountdown((prev) => (prev === null ? 8 : prev));
    }

    if (!isTrailer && t > 0 && Math.abs(t - lastSavedRef.current) >= 10) {
      lastSavedRef.current = t;
      void saveProgress({
        subject_id: subjectId,
        detail_path: detailPath,
        media_type: mediaType,
        title,
        poster_url: posterUrl,
        season_number: season || null,
        episode_number: episode || null,
        position_seconds: Math.floor(t),
        duration_seconds: Math.floor(d),
        completed: d > 0 && t / d >= COMPLETION_THRESHOLD,
      });
    }
  }, [timeEvent, player, activeTrack, cues, subtitleOffset, isTrailer, subjectId, detailPath, mediaType, title, posterUrl, season, episode, saveProgress, nextEpisode, prefs.autoPlayNext, onNavigateEpisode, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTrack) {
      setCurrentCue(cueAt(cues, positionRef.current * 1000, subtitleOffset * 1000));
    }
  }, [activeTrack, cues, subtitleOffset]);

  // Warm next episode at 80%
  useEffect(() => {
    if (isTrailer || !nextEpisode || duration <= 0) return;
    if (position / duration < 0.8) return;
    prefetchStreams(subjectId, detailPath, nextEpisode.season, nextEpisode.episode);
  }, [detailPath, duration, isTrailer, nextEpisode, position, subjectId]);

  // Persist progress on exit
  const saveExitSnapshot = useCallback(() => {
    if (isTrailer) return;
    const t = positionRef.current;
    const d = durationRef.current;
    if (t > 3) {
      void saveProgress({
        subject_id: subjectId,
        detail_path: detailPath,
        media_type: mediaType,
        title,
        poster_url: posterUrl,
        season_number: season || null,
        episode_number: episode || null,
        position_seconds: Math.floor(t),
        duration_seconds: Math.floor(d),
        completed: d > 0 && t / d >= COMPLETION_THRESHOLD,
      });
    }
  }, [detailPath, episode, isTrailer, mediaType, posterUrl, saveProgress, season, subjectId, title]);

  const saveExitRef = useRef(saveExitSnapshot);
  saveExitRef.current = saveExitSnapshot;
  useEffect(
    () => () => {
      try {
        saveExitRef.current();
      } catch {}
    },
    [],
  );
  useEffect(() => () => captionAbortRef.current?.abort(), []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && !pipActive) {
        try {
          player.pause();
        } catch {}
      }
    });
    return () => sub.remove();
  }, [pipActive, player]);

  const loadCaptions = useCallback(async () => {
    if (isTrailer || tracks !== null || tracksLoading || !detailPath) return;
    const warm = takePrefetchedCaptions(subjectId, detailPath, season, episode);
    if (warm) {
      setTracks(warm);
      return;
    }
    setTracksLoading(true);
    setTracksError(null);
    captionAbortRef.current?.abort();
    const controller = new AbortController();
    captionAbortRef.current = controller;
    try {
      const list = await fetchCaptions(subjectId, detailPath, season, episode, controller.signal);
      if (!controller.signal.aborted) setTracks(list);
    } catch {
      if (!controller.signal.aborted) {
        setTracks([]);
        setTracksError("Subtitle tracks could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) setTracksLoading(false);
    }
  }, [detailPath, episode, isTrailer, season, subjectId, tracks, tracksLoading]);

  const selectTrack = useCallback(
    async (track: CaptionTrack | null) => {
      const seq = ++captionSeqRef.current;
      setActiveTrack(track);
      setCues([]);
      setCurrentCue(null);
      setTracksError(null);
      if (!track) {
        subtitleOptOutRef.current = true;
        return;
      }
      subtitleOptOutRef.current = false;
      try {
        const body = await fetchCaptionText(track.url);
        if (seq !== captionSeqRef.current) return;
        const parsed = parseSubtitles(body);
        if (parsed.length === 0) throw new Error("empty");
        setCues(parsed);
        void saveCues(cueKey, parsed);
      } catch {
        if (seq !== captionSeqRef.current) return;
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

  useEffect(() => {
    if (isTrailer || status !== "ready" || tracks !== null || tracksLoading) return;
    if (subtitleOptOutRef.current) return;
    void loadCaptions();
  }, [isTrailer, loadCaptions, status, tracks, tracksLoading]);

  useEffect(() => {
    if (isTrailer || autoSubtitleRef.current || !tracks || tracks.length === 0) return;
    if (subtitleOptOutRef.current || activeTrack || nativeSubtitleId) return;
    autoSubtitleRef.current = true;
    const tokens = languageMatchTokens(prefs.preferredSubtitleLang);
    if (tokens.length === 0) return;
    const preferred = pickPreferredTrack(tracks, tokens);
    if (preferred) void selectTrack(preferred);
  }, [activeTrack, isTrailer, nativeSubtitleId, prefs.preferredSubtitleLang, selectTrack, tracks]);

  useEffect(() => {
    if (isTrailer || tracks === null || tracks.length > 0 || activeTrack) return;
    if (subtitleOptOutRef.current) return;
    let cancelled = false;
    void (async () => {
      const cached = await loadCues(cueKey);
      if (cancelled || !cached) return;
      setCues(cached);
      setActiveTrack({ id: "cached", language: "cached", languageName: "Offline Subtitles", url: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrack, cueKey, isTrailer, tracks]);

  const togglePlay = useCallback(() => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
  }, [player]);

  const seekTo = useCallback(
    (seconds: number) => {
      const max = durationRef.current > 0 ? durationRef.current : Math.max(0, seconds);
      const clamped = Math.max(0, Math.min(max, seconds));
      try {
        player.currentTime = clamped;
      } catch {}
      positionRef.current = clamped;
      setPosition(clamped);
    },
    [player],
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      seekTo(positionRef.current + deltaSeconds);
    },
    [seekTo],
  );

  const setPlaybackRate = useCallback(
    (next: number) => {
      try {
        player.playbackRate = next;
      } catch {}
      setRateState(next);
    },
    [player],
  );

  const setSubtitleScale = useCallback(
    (scale: number) => {
      setSubtitleScaleState(scale);
      void updatePrefs({ subtitleScale: scale });
    },
    [updatePrefs],
  );

  const pickNativeAudio = useCallback(
    (track: AudioTrack | null) => {
      try {
        player.audioTrack = track;
        setNativeAudioId(track?.id ?? null);
      } catch {}
    },
    [player],
  );

  const pickNativeSubtitle = useCallback(
    (track: SubtitleTrack | null) => {
      try {
        player.subtitleTrack = track;
        setNativeSubtitleId(track?.id ?? null);
        if (track) {
          setActiveTrack(null);
          setCues([]);
          setCurrentCue(null);
        }
      } catch {}
    },
    [player],
  );

  const switchSource = useCallback(
    (next: StreamSource) => {
      recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
      void applySource(next, positionRef.current);
    },
    [applySource],
  );

  const retry = useCallback(() => {
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    const current = sourceRef.current;
    const at = positionRef.current;
    if (current && (isOfflineUri(current.url) || isTrailer)) {
      void applySource(current, at);
      return;
    }
    if (!detailPath) {
      showError("format", "No playable source is available.");
      return;
    }
    setStatus("loading");
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked =
          (current?.resolution
            ? selectPreferredSource(res.sources, current.resolution as any, IS_TV)
            : null) ?? selectPreferredSource(res.sources, prefs.preferredQuality, IS_TV);
        if (!picked) throw new Error("No playable source returned");
        await applySource(picked, at);
      } catch (err) {
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    })();
  }, [applySource, detailPath, episode, isTrailer, prefs.preferredQuality, season, showError, subjectId]);

  // Auto-play next episode countdown
  useEffect(() => {
    if (isTrailer || !prefs.autoPlayNext || !nextEpisode || !onNavigateEpisode) return;
    if (status !== "ready" || duration <= 0) return;
    if (autoNextCancelledRef.current || nextCountdown !== null) return;
    if (position / duration < 0.95) return;
    setNextCountdown(8);
  }, [duration, isTrailer, nextCountdown, nextEpisode, onNavigateEpisode, position, prefs.autoPlayNext, status]);

  useEffect(() => {
    if (nextCountdown === null || !isPlaying) return;
    if (nextCountdown <= 0) {
      setNextCountdown(null);
      if (nextEpisode && onNavigateEpisode) {
        saveExitSnapshot();
        onNavigateEpisode(nextEpisode.season, nextEpisode.episode);
      }
      return;
    }
    const timer = setTimeout(() => setNextCountdown((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [isPlaying, nextCountdown, nextEpisode, onNavigateEpisode, saveExitSnapshot]);

  const cancelAutoNext = useCallback(() => {
    autoNextCancelledRef.current = true;
    setNextCountdown(null);
  }, []);

  return {
    player,
    source,
    availableSources,
    selectableList,
    qualityList,
    offline,
    status,
    failMessage,
    buffering,
    stallSeconds,
    isPlaying,
    position,
    duration,
    bufferedPosition,
    rate,
    fitMode,
    setFitMode,
    pipSupported,
    pipActive,
    setPipActive,
    tracks,
    tracksLoading,
    tracksError,
    activeTrack,
    currentCue,
    subtitleOffset,
    setSubtitleOffset,
    subtitleScale,
    setSubtitleScale,
    nativeAudioTracks,
    nativeSubtitleTracks,
    nativeAudioId,
    nativeSubtitleId,
    nextCountdown,
    cancelAutoNext,
    loadCaptions,
    selectTrack,
    refreshNativeTracks,
    pickNativeAudio,
    pickNativeSubtitle,
    togglePlay,
    seekTo,
    skipBy,
    setPlaybackRate,
    setHudActive,
    switchSource,
    retry,
    saveExitSnapshot,
  };
}
