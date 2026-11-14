import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  FastForward,
  ListVideo,
  Lock,
  Maximize,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  SlidersHorizontal,
  Sun,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { COMPLETION_THRESHOLD } from "@/types/library";
import type { CaptionTrack, StreamSource } from "@/types/provider";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { prefetchStreams, takePrefetched } from "@/services/provider/prefetch";
import { pickRecoverySource, qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { classifyPlayerError, playerErrorMessage, type PlayerErrorKind } from "@/services/player/classify";
import { pickAdaptiveSource, shouldDownshift } from "@/services/player/playbackPolicy";
import { cueAt, parseSubtitles, type Cue } from "@/services/subtitles/srt";
import { loadCues, pickPreferredTrack, saveCues, subtitleKey } from "@/services/subtitles/cache";
import { formatBytes } from "@/utils/format";
import { buildOptimizedImageUrl } from "@/web/components/Poster";
import { PlayerEpisodeSheet } from "@/web/components/player/PlayerEpisodeSheet";
import { PlayerScrubber } from "@/web/components/player/PlayerScrubber";
import { jobIdFor, loadOfflineTracks, webDownloadManager } from "@/web/services/downloads";
import { useLibrary } from "@/web/services/library";
import {
  preferredSubtitleWords,
  streamQualityPreferenceValue,
  usePreferences,
  type SubtitleStylePreset,
} from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";
import type { PlaybackLaunchParams } from "./DetailsScreen";

const MAX_RECOVERY_ATTEMPTS = 4;
const BUFFER_STALL_TIMEOUT_MS = 30_000;
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
const SUBTITLE_STYLES: { key: SubtitleStylePreset; label: string }[] = [
  { key: "box", label: "Box" },
  { key: "outline", label: "Outline" },
  { key: "pill", label: "Pill" },
];

function isOfflineUri(uri: string): boolean {
  return uri.startsWith("offline://") || uri.startsWith("blob:");
}

interface PlayerScreenProps {
  launch: PlaybackLaunchParams;
  onClose: () => void;
  onReplaceLaunch: (next: PlaybackLaunchParams) => void;
}

export function PlayerScreen({ launch, onClose, onReplaceLaunch }: PlayerScreenProps) {
  const { subjectId, detailPath, title, posterUrl, mediaType, season, episode, sources, resumeAt, nextEpisode, seasons } = launch;
  const { saveProgress, resumeFor } = useLibrary();
  const { play: playTone } = useSound();
  const { prefs, updatePrefs } = usePreferences();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const positionRef = useRef(Math.max(0, resumeAt));
  const durationRef = useRef(0);
  const stallTimesRef = useRef<number[]>([]);
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });
  const directFallbackRef = useRef(false);
  const proxyFallbackRef = useRef(false);
  const autoNextCancelledRef = useRef(false);
  const autoSubtitleRef = useRef(false);
  const subtitleOptOutRef = useRef(prefs.defaultSubtitleLang === "off");
  const smartTriggeredRef = useRef(false);
  const captionAbortRef = useRef<AbortController | null>(null);
  const captionSeqRef = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ t: number; side: "left" | "right" | "center" }>({ t: 0, side: "center" });
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    mode: "none" | "brightness" | "volume";
    startVal: number;
  }>({ startX: 0, startY: 0, mode: "none", startVal: 1 });

  const preferredQuality = streamQualityPreferenceValue(prefs.defaultStreamQuality);

  const [availableSources, setAvailableSources] = useState<StreamSource[]>(sources);
  const [source, setSource] = useState<StreamSource | null>(() => selectSource(sources, preferredQuality));
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [stallSeconds, setStallSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [gestureHud, setGestureHud] = useState<{ label: string; pct: number; icon: "sun" | "vol" } | null>(null);
  const [seekRipple, setSeekRipple] = useState<"left" | "right" | null>(null);

  const [position, setPosition] = useState(Math.max(0, resumeAt));
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [rate, setRate] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [cinemaMode, setCinemaMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"quality" | "subtitles" | "speed" | "episodes" | null>(null);

  const [tracks, setTracks] = useState<CaptionTrack[] | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<CaptionTrack | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [currentCue, setCurrentCue] = useState<Cue | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  const cueKey = subtitleKey(subjectId, season, episode);
  const offline = source ? isOfflineUri(source.url) : false;
  const qualityList = useMemo(() => qualityOptions(availableSources), [availableSources]);
  const pipAvailable =
    typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;

  // Resolve playback URL (offline OPFS/IDB Blob, direct CDN, or Express Range proxy).
  //
  // Direct-first is deliberate: the media CDN answers browsers from the viewer's
  // own IP (and sends `access-control-allow-origin: *`), while a server-side
  // proxy running on a datacenter IP is frequently throttled by the CDN's WAF
  // (HTTP 426/428/429). Playing direct keeps streaming working in production;
  // the Range proxy remains the fallback for CORS-restricted networks.
  useEffect(() => {
    let cancelled = false;
    directFallbackRef.current = false;
    proxyFallbackRef.current = false;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (!source) {
      setResolvedSrc(null);
      return;
    }
    if (source.url.startsWith("offline://")) {
      const id = source.url.slice("offline://".length);
      void webDownloadManager.getOfflinePlaybackUrl(id).then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setStatus("error");
          setFailMessage("Offline video file could not be found in browser storage.");
          return;
        }
        blobUrlRef.current = url;
        setResolvedSrc(url);
      });
    } else if (source.url.startsWith("blob:")) {
      setResolvedSrc(source.url);
    } else {
      setResolvedSrc(source.url);
    }

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [source]);

  // Reset per-episode state when launch changes.
  useEffect(() => {
    captionAbortRef.current?.abort();
    captionSeqRef.current += 1;
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    lastSavedRef.current = 0;
    autoNextCancelledRef.current = false;
    autoSubtitleRef.current = false;
    subtitleOptOutRef.current = prefs.defaultSubtitleLang === "off";
    smartTriggeredRef.current = false;
    positionRef.current = Math.max(0, resumeAt);
    durationRef.current = 0;
    setNextCountdown(null);
    setAvailableSources(sources);
    setSource(selectSource(sources, preferredQuality));
    setTracks(null);
    setActiveTrack(null);
    setCues([]);
    setCurrentCue(null);
    setTracksError(null);
    setStatus("loading");
    setBuffering(true);
    setFailMessage(null);
    setPosition(Math.max(0, resumeAt));
    setDuration(0);
  }, [subjectId, detailPath, season, episode, sources, resumeAt, preferredQuality, prefs.defaultSubtitleLang]);

  // Resolve streams if launched via Episode switcher / Next Episode with empty sources.
  useEffect(() => {
    if (sources.length > 0 || !detailPath) return;
    setStatus("loading");
    void (async () => {
      try {
        const offlineJob = webDownloadManager.getCompletedJob(subjectId, season, episode);
        if (offlineJob) {
          const offlineSource: StreamSource = {
            url: offlineJob.finalPath,
            resolution: offlineJob.source.resolution ?? "Offline",
            qualityValue: offlineJob.source.qualityValue,
            format: "MP4",
            codec: offlineJob.source.codec,
            sizeBytes: offlineJob.totalBytes,
            durationSeconds: null,
            sourceLabel: "Offline",
            preview: false,
            verifiedFullLength: true,
          };
          setAvailableSources([offlineSource]);
          setSource(offlineSource);
          return;
        }
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, preferredQuality);
        if (!picked) throw new Error("empty");
        setSource(picked);
      } catch {
        playTone("error");
        setStatus("error");
        setFailMessage("This episode could not be opened. Try again from its details page.");
      }
    })();
  }, [sources, subjectId, detailPath, season, episode, preferredQuality, playTone]);

  const scheduleAutoHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !activeSheet) {
        setControlsVisible(false);
      }
    }, 3400);
  }, [activeSheet]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleAutoHide();
  }, [scheduleAutoHide]);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [showControls]);

  const persistProgress = useCallback(
    (t: number, d: number) => {
      if (t <= 0) return;
      const completed = d > 0 && t / d >= COMPLETION_THRESHOLD;
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
        completed,
      });
      if (completed && !smartTriggeredRef.current) {
        smartTriggeredRef.current = true;
        void webDownloadManager.handleEpisodeWatched({
          subjectId,
          detailPath,
          title,
          posterUrl,
          mediaType,
          season,
          episode,
          nextEpisode,
          smartDownloads: prefs.smartDownloads,
          smartDeleteWatched: prefs.smartDeleteWatched,
          preferredQuality: prefs.defaultDownloadQuality === "ask" ? null : prefs.defaultDownloadQuality,
          subtitleLang: prefs.defaultSubtitleLang,
        });
      }
    },
    [
      saveProgress,
      subjectId,
      detailPath,
      mediaType,
      title,
      posterUrl,
      season,
      episode,
      nextEpisode,
      prefs.smartDownloads,
      prefs.smartDeleteWatched,
      prefs.defaultDownloadQuality,
      prefs.defaultSubtitleLang,
    ],
  );

  // Save on unmount.
  const saveOnExitRef = useRef<() => void>(() => {});
  saveOnExitRef.current = () => {
    if (positionRef.current > 3) persistProgress(positionRef.current, durationRef.current);
  };
  useEffect(() => () => saveOnExitRef.current(), []);
  useEffect(() => () => captionAbortRef.current?.abort(), []);

  const showError = useCallback(
    (kind: PlayerErrorKind, detail?: string | null) => {
      playTone("error");
      setStatus("error");
      setBuffering(false);
      setFailMessage(detail ?? playerErrorMessage(kind));
    },
    [playTone],
  );

  const recover = useCallback(
    async (kind: PlayerErrorKind, detail?: string | null) => {
      const state = recoveryRef.current;
      const current = source;
      if (state.running) return;
      if (!current || isOfflineUri(current.url) || state.attempts >= MAX_RECOVERY_ATTEMPTS) {
        showError(kind, detail);
        return;
      }
      state.running = true;
      state.attempts += 1;
      state.triedUrls.add(current.url);
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const now = Date.now();
        stallTimesRef.current = stallTimesRef.current.filter((t) => now - t <= 90_000);
        const downshift = shouldDownshift(stallTimesRef.current, now);
        const picked =
          (downshift ? pickAdaptiveSource(res.sources, current.resolution, 1) : null) ??
          pickRecoverySource(res.sources, state.triedUrls, current.resolution);
        if (!picked) {
          showError(kind, detail ?? playerErrorMessage(kind));
          return;
        }
        setStatus("loading");
        setBuffering(true);
        setFailMessage(null);
        setSource(picked);
      } catch (err) {
        const nested = classifyPlayerError(err instanceof Error ? err.message : "");
        showError(kind, playerErrorMessage(nested === "unknown" ? kind : nested));
      } finally {
        state.running = false;
      }
    },
    [source, subjectId, detailPath, season, episode, showError],
  );

  /**
   * Media error path. Playback starts on the raw CDN URL (best path: the
   * viewer's own egress is not rate-limited by the CDN WAF). If that fails we
   * retry through the server Range proxy, and only then re-resolve a fresh
   * signed source. This keeps playback alive across CORS restrictions,
   * throttled egress and stale signatures.
   */
  const handleMediaError = useCallback(() => {
    const current = source;
    if (!current || isOfflineUri(current.url) || current.url.startsWith("blob:")) {
      const errMsg = videoRef.current?.error?.message || "Media playback error";
      void recover(classifyPlayerError(errMsg), null);
      return;
    }
    if (!proxyFallbackRef.current) {
      proxyFallbackRef.current = true;
      directFallbackRef.current = true;
      setStatus("loading");
      setBuffering(true);
      setFailMessage(null);
      setResolvedSrc(`/api/proxy/media?url=${encodeURIComponent(current.url)}`);
      return;
    }
    const errMsg = videoRef.current?.error?.message || "Media playback error";
    void recover(classifyPlayerError(errMsg), null);
  }, [source, recover]);

  // Buffering stall countdown.
  useEffect(() => {
    if (!buffering || status === "error") {
      return;
    }
    setStallSeconds(0);
    const tick = window.setInterval(() => setStallSeconds((s) => s + 1), 1000);
    const timeout = window.setTimeout(() => {
      if (source) {
        stallTimesRef.current.push(Date.now());
        void recover("buffering_timeout", null);
      }
    }, BUFFER_STALL_TIMEOUT_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timeout);
    };
  }, [buffering, status, source, recover]);

  // Subtitles loading & selection (online + offline bundled multi-tracks).
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
        const bundled = loadOfflineTracks(jobIdFor({ subjectId, season, episode }));
        if (bundled.length > 0) {
          setTracks(bundled.map((b) => ({ id: b.id, language: b.language, languageName: b.languageName, url: `offline-sub://${b.id}` })));
        } else {
          setTracks([]);
          setTracksError("Subtitle tracks could not be loaded.");
        }
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
      if (track.url.startsWith("offline-sub://")) {
        const subId = track.url.slice("offline-sub://".length);
        const bundled = loadOfflineTracks(jobIdFor({ subjectId, season, episode })).find((b) => b.id === subId);
        if (bundled) {
          setCues(bundled.cues);
          return;
        }
      }
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
        setActiveTrack(null);
        setTracksError("This subtitle track could not be loaded.");
      }
    },
    [cueKey, subjectId, season, episode],
  );

  useEffect(() => {
    if (status !== "ready" || tracks !== null || tracksLoading || subtitleOptOutRef.current) return;
    void loadCaptions();
  }, [status, tracks, tracksLoading, loadCaptions]);

  useEffect(() => {
    if (autoSubtitleRef.current || !tracks || tracks.length === 0) return;
    if (subtitleOptOutRef.current || activeTrack) return;
    autoSubtitleRef.current = true;
    const words = preferredSubtitleWords(prefs.defaultSubtitleLang);
    if (words.length === 0) return;
    const preferred = pickPreferredTrack(tracks, words);
    if (preferred) void selectTrack(preferred);
  }, [tracks, activeTrack, selectTrack, prefs.defaultSubtitleLang]);

  useEffect(() => {
    if (tracks === null || tracks.length > 0 || activeTrack || subtitleOptOutRef.current) return;
    let cancelled = false;
    void loadCues(cueKey).then((cached) => {
      if (cancelled || !cached) return;
      setCues(cached);
      setActiveTrack({ id: "cached", language: "cached", languageName: "Cached", url: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [tracks, activeTrack, cueKey]);

  useEffect(() => {
    setCurrentCue(activeTrack ? cueAt(cues, position * 1000, subtitleOffset * 1000) : null);
  }, [cues, position, subtitleOffset, activeTrack]);

  // Prefetch next episode at 80%.
  useEffect(() => {
    if (!nextEpisode || duration <= 0) return;
    if (position / duration >= 0.8) {
      prefetchStreams(subjectId, detailPath, nextEpisode.season, nextEpisode.episode);
    }
  }, [nextEpisode, duration, position, subjectId, detailPath]);

  const jumpToEpisode = useCallback(
    (targetSeason: number, targetEpisode: number) => {
      const prog = resumeFor(subjectId, targetSeason, targetEpisode);
      onReplaceLaunch({
        subjectId,
        detailPath,
        title,
        posterUrl,
        mediaType,
        season: targetSeason,
        episode: targetEpisode,
        resumeAt: prog && !prog.completed ? prog.position_seconds : 0,
        sources: takePrefetched(subjectId, detailPath, targetSeason, targetEpisode)?.sources ?? [],
        nextEpisode: { season: targetSeason, episode: targetEpisode + 1 },
        seasons,
      });
    },
    [onReplaceLaunch, subjectId, detailPath, title, posterUrl, mediaType, seasons, resumeFor],
  );

  const goNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    jumpToEpisode(nextEpisode.season, nextEpisode.episode);
  }, [nextEpisode, jumpToEpisode]);

  useEffect(() => {
    if (!prefs.autoNextEpisode || !nextEpisode || status !== "ready" || duration <= 0) return;
    if (autoNextCancelledRef.current || nextCountdown !== null) return;
    if (position / duration >= 0.94) setNextCountdown(8);
  }, [prefs.autoNextEpisode, nextEpisode, status, duration, position, nextCountdown]);

  useEffect(() => {
    if (nextCountdown === null || !isPlaying) return;
    if (nextCountdown <= 0) {
      setNextCountdown(null);
      goNextEpisode();
      return;
    }
    const t = window.setTimeout(() => setNextCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [nextCountdown, isPlaying, goNextEpisode]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
    showControls();
  }, [showControls]);

  const skip = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : v.currentTime + delta;
      const next = Math.max(0, Math.min(max, v.currentTime + delta));
      v.currentTime = next;
      positionRef.current = next;
      setPosition(next);
      setSeekRipple(delta < 0 ? "left" : "right");
      window.setTimeout(() => setSeekRipple(null), 550);
    },
    [],
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Media Session API for Android/desktop media notifications & lock-screen controls.
  const episodeLabel = mediaType === "series" ? `Season ${season} · Episode ${episode}` : null;
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title,
        artist: episodeLabel ?? "Hallyu TV",
        artwork: posterUrl ? [{ src: buildOptimizedImageUrl(posterUrl, 512), sizes: "512x512", type: "image/webp" }] : [],
      });
      ms.setActionHandler("play", () => void videoRef.current?.play().catch(() => {}));
      ms.setActionHandler("pause", () => videoRef.current?.pause());
      ms.setActionHandler("seekbackward", () => skip(-10));
      ms.setActionHandler("seekforward", () => skip(10));
      ms.setActionHandler("nexttrack", nextEpisode ? () => goNextEpisode() : null);
    } catch {}
    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("seekbackward", null);
        ms.setActionHandler("seekforward", null);
        ms.setActionHandler("nexttrack", null);
      } catch {}
    };
  }, [title, episodeLabel, posterUrl, nextEpisode, goNextEpisode, skip]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      if (duration > 0 && typeof navigator.mediaSession.setPositionState === "function") {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: rate,
          position: Math.min(duration, position),
        });
      }
    } catch {}
  }, [isPlaying, duration, position, rate]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skip(-10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skip(10);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMuted((m) => !m);
      } else if (e.key === "Escape") {
        if (activeSheet) setActiveSheet(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, skip, toggleFullscreen, activeSheet, onClose]);

  const manualRetry = useCallback(() => {
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUrls: new Set(), running: false };
    setStatus("loading");
    setBuffering(true);
    if (!source || isOfflineUri(source.url)) {
      if (videoRef.current) {
        videoRef.current.load();
        void videoRef.current.play().catch(() => {});
      }
      return;
    }
    void (async () => {
      try {
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        setAvailableSources(res.sources);
        const picked = selectSource(res.sources, source.resolution) ?? selectSource(res.sources, null);
        if (!picked) throw new Error("No playable source returned.");
        setSource(picked);
      } catch (err) {
        showError(classifyPlayerError(err instanceof Error ? err.message : ""), null);
      }
    })();
  }, [source, subjectId, detailPath, season, episode, showError]);

  const handleStageTap = (clientX: number, rectWidth: number) => {
    if (locked) return;
    const now = Date.now();
    const ratio = rectWidth > 0 ? clientX / rectWidth : 0.5;
    const side: "left" | "right" | "center" = ratio < 0.34 ? "left" : ratio > 0.66 ? "right" : "center";

    if (side !== "center" && lastTapRef.current.side === side && now - lastTapRef.current.t < 310) {
      lastTapRef.current.t = 0;
      skip(side === "left" ? -10 : 10);
      return;
    }
    lastTapRef.current = { t: now, side };
    setControlsVisible((v) => {
      const next = !v;
      if (next) scheduleAutoHide();
      return next;
    });
  };

  if (!source) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-extrabold text-white mb-2">Nothing to play</h2>
        <p className="text-sm text-[#A8B4C4] mb-6">No full-length playable source was returned for this title.</p>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-full bg-white/15 text-white font-bold text-sm hover:bg-white/25 transition"
        >
          Back
        </button>
      </div>
    );
  }

  const subStyleClass =
    prefs.subtitleStyle === "outline"
      ? "bg-transparent text-white font-bold"
      : prefs.subtitleStyle === "pill"
        ? "px-5 py-1.5 rounded-full bg-black/85 text-white font-semibold border border-white/15"
        : "px-4 py-1.5 rounded-lg bg-[#080A0D]/75 text-white font-semibold";

  const subTextShadow =
    prefs.subtitleStyle === "outline"
      ? "0 0 3px #000, 0 0 6px #000, 1px 1px 2px #000, -1px -1px 2px #000"
      : "0 1px 4px rgba(0,0,0,0.9)";

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onClick={(e) => handleStageTap(e.clientX, e.currentTarget.clientWidth)}
      onTouchStart={(e) => {
        if (locked || e.touches.length !== 1) return;
        const touch = e.touches[0]!;
        const w = e.currentTarget.clientWidth || 1;
        const ratio = touch.clientX / w;
        if (ratio < 0.32) {
          touchGestureRef.current = { startX: touch.clientX, startY: touch.clientY, mode: "brightness", startVal: brightness };
        } else if (ratio > 0.68) {
          touchGestureRef.current = { startX: touch.clientX, startY: touch.clientY, mode: "volume", startVal: volume };
        } else {
          touchGestureRef.current = { startX: touch.clientX, startY: touch.clientY, mode: "none", startVal: 1 };
        }
      }}
      onTouchMove={(e) => {
        const g = touchGestureRef.current;
        if (g.mode === "none" || e.touches.length !== 1) return;
        const touch = e.touches[0]!;
        const dy = g.startY - touch.clientY;
        if (Math.abs(dy) < 12) return;
        const delta = dy / 220;
        if (g.mode === "brightness") {
          const next = Math.min(1, Math.max(0.25, g.startVal + delta));
          setBrightness(next);
          setGestureHud({ label: "Brightness", pct: Math.round(next * 100), icon: "sun" });
        } else {
          const next = Math.min(1, Math.max(0, g.startVal + delta));
          setVolume(next);
          if (videoRef.current) {
            videoRef.current.volume = next;
            if (next > 0 && muted) {
              videoRef.current.muted = false;
              setMuted(false);
            }
          }
          setGestureHud({ label: "Volume", pct: Math.round(next * 100), icon: "vol" });
        }
      }}
      onTouchEnd={() => {
        touchGestureRef.current.mode = "none";
        if (gestureHud) window.setTimeout(() => setGestureHud(null), 650);
      }}
      className="fixed inset-0 z-50 bg-black text-white select-none flex items-center justify-center overflow-hidden"
    >
      {resolvedSrc ? (
        <video
          ref={videoRef}
          src={resolvedSrc}
          autoPlay
          muted={muted}
          playsInline
          className={`w-full h-full ${fitMode === "cover" ? "object-cover" : "object-contain"}`}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (positionRef.current > 0 && Number.isFinite(v.duration) && positionRef.current < v.duration - 2) {
              v.currentTime = positionRef.current;
            }
            v.playbackRate = rate;
            v.volume = volume;
            if (Number.isFinite(v.duration)) {
              durationRef.current = v.duration;
              setDuration(v.duration);
            }
          }}
          onCanPlay={() => {
            setStatus("ready");
            setBuffering(false);
            setFailMessage(null);
          }}
          onPlay={() => {
            setIsPlaying(true);
            setBuffering(false);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setStatus("ready");
            setBuffering(false);
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            const t = v.currentTime;
            const d = Number.isFinite(v.duration) ? v.duration : 0;
            positionRef.current = t;
            if (d > 0) durationRef.current = d;
            setPosition(t);
            if (d > 0) setDuration(d);
            if (v.buffered.length > 0) {
              setBuffered(v.buffered.end(v.buffered.length - 1));
            }
            if (t > 0 && t - lastSavedRef.current >= 10) {
              lastSavedRef.current = t;
              persistProgress(t, d);
            }
          }}
          onError={() => {
            handleMediaError();
          }}
        />
      ) : null}

      {/* Brightness & Cinema Shade Layers */}
      {brightness < 0.99 ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: Math.min(0.75, Math.max(0, 1 - brightness)) }}
        />
      ) : null}
      {cinemaMode ? <div className="absolute inset-0 bg-black/25 pointer-events-none" /> : null}

      {/* Double-Tap Seek Feedback */}
      {seekRipple ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-20 px-6 py-4 rounded-full bg-black/70 border border-white/20 flex items-center gap-2 text-sm font-extrabold text-white shadow-2xl ${
            seekRipple === "left" ? "left-10" : "right-10"
          }`}
        >
          {seekRipple === "left" ? <RotateCcw className="w-5 h-5 text-[#FF8256]" /> : <RotateCw className="w-5 h-5 text-[#FF8256]" />}
          <span>{seekRipple === "left" ? "-10s" : "+10s"}</span>
        </div>
      ) : null}

      {/* Brightness / Volume Swipe HUD */}
      {gestureHud ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 glass-panel-bright rounded-2xl px-5 py-3 flex items-center gap-3"
        >
          {gestureHud.icon === "sun" ? <Sun className="w-5 h-5 text-[#FF8256]" /> : <Volume2 className="w-5 h-5 text-[#FF8256]" />}
          <span className="text-sm font-bold text-white">{gestureHud.label}</span>
          <span className="text-sm font-mono font-bold text-[#FF8256]">{gestureHud.pct}%</span>
        </div>
      ) : null}

      {/* Subtitle Overlay */}
      {activeTrack && currentCue ? (
        <div
          className={`absolute inset-x-6 flex justify-center pointer-events-none transition-all ${
            controlsVisible ? "bottom-28" : "bottom-10"
          }`}
        >
          <div
            className={`text-center max-w-2xl whitespace-pre-line ${subStyleClass}`}
            style={{
              fontSize: `${Math.round(18 * prefs.subtitleScale)}px`,
              textShadow: subTextShadow,
            }}
          >
            {currentCue.text}
          </div>
        </div>
      ) : null}

      {/* Next Episode Card */}
      {nextCountdown !== null && status !== "error" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-6 bottom-28 z-20 glass-panel-bright rounded-2xl p-4 flex items-center gap-3 shadow-2xl min-w-[270px]"
        >
          <div className="flex-1">
            <p className="text-[10px] font-bold tracking-wider uppercase text-[#A8B4C4]">Next episode</p>
            <p className="text-sm font-bold text-white mt-0.5">Starts in {nextCountdown}s</p>
          </div>
          <button
            type="button"
            onClick={goNextEpisode}
            className="px-3.5 py-2 rounded-full ember-gradient text-xs font-extrabold text-white"
          >
            Play now
          </button>
          <button
            type="button"
            onClick={() => {
              autoNextCancelledRef.current = true;
              setNextCountdown(null);
            }}
            className="px-2 py-2 text-xs font-bold text-[#A8B4C4] hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Buffering Indicator */}
      {status === "loading" || (buffering && status === "ready") ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#FF5E3A] border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-[#A8B4C4]">
            {offline
              ? "Opening offline file…"
              : stallSeconds >= 5
                ? `Reconnecting… ${Math.max(0, BUFFER_STALL_TIMEOUT_MS / 1000 - stallSeconds)}s`
                : "Preparing stream…"}
          </p>
        </div>
      ) : null}

      {/* Error Overlay */}
      {status === "error" ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 bg-[#080A0D]/95 flex flex-col items-center justify-center p-8 text-center gap-4"
        >
          <h2 className="text-xl font-extrabold text-white">Playback problem</h2>
          <p className="text-sm text-[#A8B4C4] max-w-md">{failMessage ?? "Something interrupted this stream."}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={manualRetry}
              className="px-7 py-2.5 rounded-full ember-gradient text-white font-bold text-sm"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-7 py-2.5 rounded-full bg-white/10 border border-white/15 text-white font-bold text-sm hover:bg-white/20"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {/* Locked Pill */}
      {locked ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLocked(false);
            showControls();
          }}
          className="absolute bottom-8 z-20 inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-panel-bright text-xs font-bold text-white"
        >
          <Unlock className="w-4 h-4 text-[#FF8256]" />
          Locked · tap to unlock
        </button>
      ) : null}

      {/* Player Chrome */}
      {controlsVisible && status !== "error" && !locked ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-black/75 via-transparent to-black/85">
          {/* Top Bar */}
          <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close player"
                className="w-10 h-10 rounded-full glass-panel-bright flex items-center justify-center text-white hover:bg-white/20 shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-white truncate">{title}</h1>
                <p className="text-xs text-[#A8B4C4] truncate">
                  {[episodeLabel, offline ? "Offline" : "Streaming", source.resolution].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCinemaMode((c) => !c)}
                aria-label="Toggle cinema shade"
                className={`p-2.5 rounded-full glass-panel text-xs transition ${
                  cinemaMode ? "text-[#FF8256] border-[#FF8256]/60" : "text-[#A8B4C4] hover:text-white"
                }`}
                title="Cinema shade"
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLocked(true)}
                aria-label="Lock player controls"
                className="p-2.5 rounded-full glass-panel text-[#A8B4C4] hover:text-white transition"
                title="Lock controls"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Transport */}
          <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-6 sm:gap-10">
            <button
              type="button"
              onClick={() => skip(-10)}
              aria-label="Rewind 10 seconds"
              className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-white hover:bg-white/15 transition"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-16 h-16 rounded-full ember-gradient flex items-center justify-center text-white shadow-[0_0_28px_rgba(255,94,58,0.5)] hover:brightness-110 transition"
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              aria-label="Forward 10 seconds"
              className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-white hover:bg-white/15 transition"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Scrubber & Controls */}
          <div onClick={(e) => e.stopPropagation()} className="space-y-3">
            <PlayerScrubber
              videoRef={videoRef}
              position={position}
              duration={duration}
              buffered={buffered}
              onSeek={(next) => {
                if (videoRef.current) videoRef.current.currentTime = next;
                positionRef.current = next;
                setPosition(next);
                showControls();
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.muted = !muted;
                    setMuted((m) => !m);
                  }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="p-2 rounded-full hover:bg-white/10 text-[#A8B4C4] hover:text-white"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {!offline ? (
                  <button
                    type="button"
                    onClick={() => setActiveSheet("quality")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>{source.resolution ?? "Quality"}</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    void loadCaptions();
                    setActiveSheet("subtitles");
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    activeTrack ? "bg-[#FF5E3A]/20 text-[#FF8256]" : "bg-white/10 hover:bg-white/15 text-white"
                  }`}
                >
                  <Captions className="w-3.5 h-3.5" />
                  <span>{activeTrack ? activeTrack.languageName : "Subtitles"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSheet("speed")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>{rate}×</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {mediaType === "series" ? (
                  <button
                    type="button"
                    onClick={() => setActiveSheet("episodes")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                  >
                    <ListVideo className="w-3.5 h-3.5" />
                    <span>Episodes</span>
                  </button>
                ) : null}

                {nextEpisode ? (
                  <button
                    type="button"
                    onClick={goNextEpisode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>Next ep</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setFitMode((m) => (m === "contain" ? "cover" : "contain"))}
                  className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#A8B4C4] hover:text-white"
                >
                  {fitMode === "contain" ? "Fit" : "Fill"}
                </button>

                {pipAvailable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!videoRef.current) return;
                      if (document.pictureInPictureElement) {
                        void document.exitPictureInPicture().catch(() => {});
                      } else {
                        void videoRef.current.requestPictureInPicture().catch(() => {});
                      }
                    }}
                    aria-label="Picture in Picture"
                    className="p-2 rounded-full hover:bg-white/10 text-[#A8B4C4] hover:text-white"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  className="p-2 rounded-full hover:bg-white/10 text-[#A8B4C4] hover:text-white"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Picker Sheets */}
      {activeSheet === "episodes" ? (
        <PlayerEpisodeSheet
          subjectId={subjectId}
          detailPath={detailPath}
          currentSeason={season}
          currentEpisode={episode}
          initialSeasons={seasons}
          onSelectEpisode={jumpToEpisode}
          onClose={() => setActiveSheet(null)}
        />
      ) : activeSheet ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setActiveSheet(null);
          }}
          className="absolute inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center p-4"
        >
          <div
            role="dialog"
            aria-label={`${activeSheet} options`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-panel-bright rounded-3xl p-5 max-h-[80vh] overflow-y-auto space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h2 className="text-base font-bold text-white capitalize">{activeSheet}</h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Close options"
                className="p-1.5 rounded-full bg-white/10 text-[#A8B4C4] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeSheet === "quality" ? (
              <div className="space-y-2">
                {selectableSources(availableSources).map((s) => {
                  const active = s.url === source.url;
                  return (
                    <button
                      key={s.url}
                      type="button"
                      onClick={() => {
                        setActiveSheet(null);
                        recoveryRef.current = { attempts: 0, triedUrls: new Set(), running: false };
                        setStatus("loading");
                        setBuffering(true);
                        setSource(s);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${
                        active ? "bg-[#FF5E3A]/15 border-[#FF8256] text-white" : "bg-white/5 border-white/10 text-[#A8B4C4]"
                      }`}
                    >
                      <span className="font-bold text-sm">{s.resolution ?? s.format}</span>
                      <span className="text-xs">{s.sizeBytes ? formatBytes(s.sizeBytes) : s.format}</span>
                    </button>
                  );
                })}
                {qualityList.length > 0 ? (
                  <p className="text-xs text-[#6B7787] text-center pt-1">
                    {qualityList.length} full-length qualities available
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeSheet === "speed" ? (
              <div className="grid grid-cols-5 gap-2">
                {SPEED_OPTIONS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => {
                      setRate(sp);
                      if (videoRef.current) videoRef.current.playbackRate = sp;
                      setActiveSheet(null);
                    }}
                    className={`py-2.5 rounded-xl font-bold text-xs border ${
                      rate === sp
                        ? "ember-gradient border-[#FF8256] text-white"
                        : "bg-white/5 border-white/10 text-[#A8B4C4] hover:text-white"
                    }`}
                  >
                    {sp}×
                  </button>
                ))}
              </div>
            ) : null}

            {activeSheet === "subtitles" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-[#A8B4C4] bg-white/5 p-2.5 rounded-xl">
                  <span>
                    Timing: {subtitleOffset >= 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSubtitleOffset((o) => Number((o - 0.5).toFixed(1)))}
                      className="px-2.5 py-1 rounded bg-white/10 text-white font-bold"
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubtitleOffset((o) => Number((o + 0.5).toFixed(1)))}
                      className="px-2.5 py-1 rounded bg-white/10 text-white font-bold"
                    >
                      +0.5s
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-[#A8B4C4] bg-white/5 p-2.5 rounded-xl">
                  <span>Text size: {Math.round(prefs.subtitleScale * 100)}%</span>
                  <div className="flex gap-1.5">
                    {[0.85, 1, 1.25].map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => updatePrefs({ subtitleScale: sc })}
                        className={`px-2.5 py-1 rounded font-bold ${
                          prefs.subtitleScale === sc ? "bg-[#FF5E3A] text-white" : "bg-white/10 text-white"
                        }`}
                      >
                        {Math.round(sc * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-[#A8B4C4] bg-white/5 p-2.5 rounded-xl">
                  <span>Style</span>
                  <div className="flex gap-1.5">
                    {SUBTITLE_STYLES.map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => updatePrefs({ subtitleStyle: st.key })}
                        className={`px-2.5 py-1 rounded font-bold ${
                          prefs.subtitleStyle === st.key ? "bg-[#FF5E3A] text-white" : "bg-white/10 text-white"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    subtitleOptOutRef.current = true;
                    void selectTrack(null);
                    setActiveSheet(null);
                  }}
                  className={`w-full p-3 rounded-xl border text-left text-sm font-semibold ${
                    !activeTrack ? "bg-[#FF5E3A]/15 border-[#FF8256] text-white" : "bg-white/5 border-white/10 text-[#A8B4C4]"
                  }`}
                >
                  Off
                </button>

                {tracksLoading ? <p className="text-xs text-[#A8B4C4] py-2">Loading subtitle tracks…</p> : null}
                {tracksError ? <p className="text-xs text-red-400 py-1">{tracksError}</p> : null}

                {(tracks ?? []).map((t) => {
                  const active = activeTrack?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        subtitleOptOutRef.current = false;
                        void selectTrack(t);
                        setActiveSheet(null);
                      }}
                      className={`w-full p-3 rounded-xl border text-left text-sm font-semibold ${
                        active ? "bg-[#FF5E3A]/15 border-[#FF8256] text-white" : "bg-white/5 border-white/10 text-[#A8B4C4]"
                      }`}
                    >
                      {t.languageName}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
