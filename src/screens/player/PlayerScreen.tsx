import { Button } from "@/components/ui/Button";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, resolveStreams } from "@/services/provider/adapter";
import { classifyPlayerError, playerErrorMessage, PlayerErrorKind } from "@/services/player/classify";
import { qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { PROVIDER_MEDIA_HEADERS } from "@/services/provider/client";
import { parseSrt, cueAt, Cue } from "@/services/subtitles/srt";
import { useLibrary } from "@/state/LibraryContext";
import { CaptionTrack, StreamSource } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  ChevronLeft,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Subtitles,
  Gauge,
} from "lucide-react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return (h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
}

/** Bounded automatic recovery: never an endless retry loop. */
const MAX_RECOVERY_ATTEMPTS = 3;
/** A load that produces no frame for this long is a buffering timeout, not an endless spinner. */
const BUFFER_STALL_TIMEOUT_MS = 30_000;

export function PlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const navigation = useNavigation<Nav>();
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt } = route.params;
  const { saveProgress, progress } = useLibrary();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  useKeepAwake();

  // Verified full-length sources only; previews are never listed or picked.
  const qualityList = useMemo(() => qualityOptions(sources), [sources]);
  const [source, setSource] = useState<StreamSource | null>(() => selectSource(sources, null));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [subtitlePickerOpen, setSubtitlePickerOpen] = useState(false);
  const [tracks, setTracks] = useState<CaptionTrack[] | null>(null);
  const [activeTrack, setActiveTrack] = useState<CaptionTrack | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [currentCue, setCurrentCue] = useState<Cue | null>(null);
  const [position, setPosition] = useState(resumeAt);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const lastSavedRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards: a late async response must never overwrite a newer user selection.
  const requestSeqRef = useRef(0);
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const recoveryRef = useRef({ attempts: 0, triedUrls: new Set<string>(), running: false });

  // Restore remote progress when the player mounts (cross-device resume).
  const remoteResume = useMemo(() => {
    const p = progress.find(
      (row) =>
        row.subject_id === subjectId &&
        row.season_number === (season || null) &&
        row.episode_number === (episode || null),
    );
    return p && !p.completed ? p.position_seconds : null;
  }, [progress, subjectId, season, episode]);

  const startAt = Math.max(resumeAt, remoteResume ?? 0, 0);

  const player = useVideoPlayer(
    source ? { uri: source.url, headers: PROVIDER_MEDIA_HEADERS } : null,
    (p) => {
      p.currentTime = startAt;
      p.play();
    },
  );

  const playing = useEvent(player, "playingChange", { isPlaying: false });
  const statusChange = useEvent(player, "statusChange", { status: "loading" as const, error: undefined });
  const timeUpdate = useEvent(player, "timeUpdate", { currentTime: startAt, currentLiveTimestamp: null, currentOffsetFromLive: 0, bufferedPosition: 0 });

  useEffect(() => {
    setIsPlaying(playing.isPlaying);
  }, [playing]);

  /** Swap in a new source while preserving the playback position. */
  const applySource = useCallback(
    (next: StreamSource, at: number, isRetry: boolean) => {
      if (isRetry) requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      setSource(next);
      setStatus("loading");
      setBuffering(true);
      setTimeout(() => {
        if (seq !== requestSeqRef.current) return; // a newer selection superseded this one
        player.replace({ uri: next.url, headers: PROVIDER_MEDIA_HEADERS });
        player.currentTime = at;
        player.play();
      }, 0);
    },
    [player],
  );

  const showError = useCallback((kind: PlayerErrorKind, detail: string | null) => {
    setStatus("error");
    setFailMessage(detail ?? playerErrorMessage(kind));
  }, []);

  /**
   * Bounded recovery on real failures: fresh resolve → same quality with a new
   * signed URL → next verified full-length source. Position is preserved
   * across every switch.
   */
  const recover = useCallback(
    async (kind: PlayerErrorKind, detail: string | null) => {
      const state = recoveryRef.current;
      if (state.running) return;
      if (state.attempts >= MAX_RECOVERY_ATTEMPTS || !sourceRef.current) {
        showError(kind, detail);
        return;
      }
      state.running = true;
      state.attempts += 1;
      const at = player.currentTime;
      try {
        const seq = ++requestSeqRef.current;
        state.triedUrls.add(sourceRef.current.url);
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        if (seq !== requestSeqRef.current) return; // user acted meanwhile
        const candidates = selectableSources(res.sources).filter((s) => !state.triedUrls.has(s.url));
        const sameQuality = candidates.find((s) => s.resolution === sourceRef.current?.resolution);
        const next = sameQuality ?? candidates[0] ?? null;
        if (!next) {
          showError(kind, detail ?? playerErrorMessage(kind));
          return;
        }
        state.running = false;
        applySource(next, at, true);
      } catch (err) {
        if (err instanceof Error && err.message) {
          const nested = classifyPlayerError(err.message);
          showError(kind, playerErrorMessage(nested === "unknown" ? kind : nested));
        } else {
          showError(kind, detail);
        }
      } finally {
        state.running = false;
      }
    },
    [player, subjectId, detailPath, season, episode, applySource, showError],
  );

  // Real native errors from expo-video statusChange — classified, not assumed to be "decoder".
  useEffect(() => {
    setBuffering(statusChange.status === "loading");
    if (statusChange.status === "readyToPlay") {
      setStatus("playing");
      return;
    }
    if (statusChange.status === "error") {
      const kind = classifyPlayerError(statusChange.error?.message ?? "");
      void recover(kind, null);
    }
  }, [statusChange, recover]);

  // Buffering watchdog: no frame for 30s counts as a stall failure.
  useEffect(() => {
    if (!buffering || status === "error") return;
    const t = setTimeout(() => {
      if (sourceRef.current) void recover("buffering_timeout", null);
    }, BUFFER_STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [buffering, status, recover]);

  useEffect(() => {
    const t = timeUpdate?.currentTime ?? position;
    const d = player.duration;
    setPosition(t);
    if (d > 0) setDuration(d);
    if (activeTrack) setCurrentCue(cueAt(cues, t * 1000, subtitleOffset * 1000));

    // Debounced progress persistence: every 10s of playback, plus near-completion.
    if (t - lastSavedRef.current >= 10) {
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
        completed: d > 0 && t / d > 0.95,
      });
    }
  }, [timeUpdate, player, position, activeTrack, cues, subtitleOffset, subjectId, detailPath, mediaType, title, season, episode, saveProgress, route.params]);

  // Save on unmount (leaving the player) and when completed.
  useEffect(() => {
    return () => {
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
          completed: d > 0 && t / d > 0.95,
        });
      }
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const loadCaptions = useCallback(async () => {
    if (tracks !== null) return tracks;
    try {
      const t = await fetchCaptions(subjectId, detailPath, season, episode);
      setTracks(t);
      return t;
    } catch {
      setTracks([]);
      return [];
    }
  }, [subjectId, detailPath, season, episode, tracks]);

  const selectTrack = useCallback(
    async (track: CaptionTrack | null) => {
      setActiveTrack(track);
      setCues([]);
      setCurrentCue(null);
      if (!track) return;
      try {
        const res = await fetch(track.url, { headers: PROVIDER_MEDIA_HEADERS });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.text();
        setCues(parseSrt(body));
      } catch {
        setActiveTrack(null);
        setFailMessage("This subtitle track could not be loaded.");
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
        Animated.timing(controlsOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setControlsVisible(false));
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
      const next = Math.max(0, Math.min(player.duration, player.currentTime + seconds));
      player.currentTime = next;
      showControls();
    },
    [player, showControls],
  );

  /** Explicit user quality choice: resets the recovery budget for the new selection. */
  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
      applySource(next, player.currentTime, true);
    },
    [applySource, player],
  );

  /** Manual retry: fresh links and a clean recovery budget. */
  const retry = useCallback(() => {
    setStatus("loading");
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUrls: new Set<string>(), running: false };
    if (source) {
      applySource(source, player.currentTime, true);
    } else {
      void recover("expired", null);
    }
  }, [source, applySource, player, recover]);

  const landscape = width > height;
  const active = source ?? selectSource(sources, null);

  if (!active) {
    return (
      <View style={styles.root}>
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Nothing to play</Text>
          <Text style={styles.errorMessage}>Only preview clips were returned for this title, and previews cannot be played here.</Text>
          <Button label="Back" variant="quiet" onPress={() => navigation.goBack()} style={{ alignSelf: "stretch" }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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

      {/* Subtitle overlay */}
      {activeTrack && currentCue ? (
        <View style={[styles.subtitleOverlay, { bottom: landscape ? 90 : 110 }]} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentCue.text}</Text>
        </View>
      ) : null}

      {status === "loading" || buffering ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.bufferLabel}>Preparing stream…</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Playback problem</Text>
          <Text style={styles.errorMessage}>{failMessage ?? "Something interrupted this stream."}</Text>
          <Button label="Retry" onPress={retry} style={{ alignSelf: "stretch" }} />
          <Button label="Back" variant="quiet" onPress={() => navigation.goBack()} style={{ alignSelf: "stretch" }} />
        </View>
      ) : null}

      {controlsVisible && status !== "error" ? (
        <Animated.View style={[styles.controls, { opacity: controlsOpacity }]}>
          <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={8}>
            <ChevronLeft size={24} color={palette.textPrimary} />
          </Pressable>

          <View style={styles.controlsCenter}>
            <Pressable style={styles.skipBtn} onPress={() => skip(-10)}>
              <RotateCcw size={22} color={palette.textPrimary} />
              <Text style={styles.skipLabel}>10</Text>
            </Pressable>
            <Pressable
              style={styles.playPause}
              onPress={() => {
                if (player.playing) player.pause();
                else player.play();
                showControls();
              }}
            >
              {isPlaying ? (
                <Pause size={26} color="#1A0E0A" fill="#1A0E0A" />
              ) : (
                <Play size={26} color="#1A0E0A" fill="#1A0E0A" />
              )}
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={() => skip(10)}>
              <RotateCw size={22} color={palette.textPrimary} />
              <Text style={styles.skipLabel}>10</Text>
            </Pressable>
          </View>

          <View style={styles.seekRow}>
            <Text style={styles.timeLabel}>{fmt(position)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={position}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor="rgba(244,242,237,0.25)"
              thumbTintColor={palette.accent}
              onSlidingComplete={(v) => {
                player.currentTime = v;
                showControls();
              }}
            />
            <Text style={styles.timeLabel}>{duration > 0 ? fmt(duration) : "--:--"}</Text>
          </View>

          <View style={styles.bottomRow}>
            <Pressable style={styles.bottomBtn} onPress={() => { void loadCaptions(); setSubtitlePickerOpen(true); }}>
              <Subtitles size={16} color={activeTrack ? palette.accent : palette.textPrimary} />
              <Text style={styles.bottomLabel}>{activeTrack ? activeTrack.languageName : "Subtitles"}</Text>
            </Pressable>
            <Pressable style={styles.bottomBtn} onPress={() => setQualityPickerOpen(true)}>
              <Gauge size={16} color={palette.textPrimary} />
              <Text style={styles.bottomLabel}>{active.resolution ?? "Auto"}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Quality picker — verified full-length sources only, best-first. */}
      {qualityPickerOpen ? (
        <Sheet title="Quality" onClose={() => setQualityPickerOpen(false)}>
          {selectableSources(sources).map((s) => (
            <Pressable key={s.url} style={[styles.option, s.url === active.url && styles.optionActive]} onPress={() => switchSource(s)}>
              <Text style={styles.optionTitle}>{s.resolution ?? "Auto"}</Text>
              <Text style={styles.optionMeta}>
                {[s.codec?.toUpperCase(), s.sizeBytes ? `${(s.sizeBytes / 1_048_576).toFixed(0)} MB` : null, s.format].filter(Boolean).join(" · ")}
              </Text>
            </Pressable>
          ))}
        </Sheet>
      ) : null}

      {/* Subtitle picker */}
      {subtitlePickerOpen ? (
        <Sheet title="Subtitles" onClose={() => setSubtitlePickerOpen(false)}>
          <Pressable style={[styles.option, activeTrack === null && styles.optionActive]} onPress={() => { setActiveTrack(null); setSubtitlePickerOpen(false); }}>
            <Text style={styles.optionTitle}>Off</Text>
          </Pressable>
          {(tracks ?? []).map((t) => (
            <Pressable key={t.id} style={[styles.option, activeTrack?.id === t.id && styles.optionActive]} onPress={() => { void selectTrack(t); setSubtitlePickerOpen(false); }}>
              <Text style={styles.optionTitle}>{t.languageName}</Text>
            </Pressable>
          ))}
          {activeTrack ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.optionMeta}>Subtitle delay: {subtitleOffset.toFixed(1)}s</Text>
              <Slider
                style={styles.slider}
                minimumValue={-5}
                maximumValue={5}
                step={0.5}
                value={subtitleOffset}
                minimumTrackTintColor={palette.accent}
                maximumTrackTintColor="rgba(244,242,237,0.25)"
                thumbTintColor={palette.accent}
                onValueChange={setSubtitleOffset}
              />
            </View>
          ) : null}
          {tracks !== null && tracks.length === 0 ? (
            <Text style={styles.optionMeta}>No caption tracks were returned for this title.</Text>
          ) : null}
        </Sheet>
      ) : null}
    </View>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Pressable style={styles.sheetBackdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
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
    borderRadius: radius.sm,
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
  errorTitle: { ...typeScale.title, color: palette.textPrimary },
  errorMessage: { ...typeScale.body, color: palette.textSecondary, textAlign: "center", marginBottom: spacing.md },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,10,13,0.42)", justifyContent: "space-between" },
  back: { position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(8,10,13,0.55)", alignItems: "center", justifyContent: "center" },
  controlsCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 34 },
  skipBtn: { alignItems: "center", justifyContent: "center" },
  skipLabel: { color: palette.textPrimary, fontSize: 9, fontWeight: "700", marginTop: -2 },
  playPause: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  seekRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  slider: { flex: 1 },
  timeLabel: { color: palette.textPrimary, fontSize: 11, fontVariant: ["tabular-nums"], minWidth: 40, textAlign: "center" },
  bottomRow: { position: "absolute", bottom: 54, left: spacing.lg, right: spacing.lg, flexDirection: "row", gap: spacing.md },
  bottomBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(8,10,13,0.55)", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  bottomLabel: { color: palette.textPrimary, fontSize: 12, fontWeight: "600" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderColor: palette.glassStroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sheetTitle: { ...typeScale.title, color: palette.textPrimary, marginBottom: spacing.sm },
  option: {
    borderRadius: radius.md,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionActive: { borderColor: palette.accent, backgroundColor: "rgba(240,120,85,0.10)" },
  optionTitle: { color: palette.textPrimary, fontWeight: "700", fontSize: 15 },
  optionMeta: { color: palette.textMuted, fontSize: 12 },
});
