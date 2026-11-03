import { palette, spacing } from "@/design-system/tokens";
import { Platform } from "react-native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, resolveStreams } from "@/services/provider/adapter";
import { classifyPlayerError, playerErrorMessage, PlayerErrorKind } from "@/services/player/classify";
import { PlayerControls } from "./PlayerControls";
import { PickerSheet, QualityOptions, SubtitleOptions } from "./PickerSheets";
import { qualityOptions, selectableSources, selectSource } from "@/services/provider/streams";
import { transportChain, TransportUri, StreamContext } from "@/services/provider/transport";
import { parseSrt, cueAt, Cue } from "@/services/subtitles/srt";
import { useLibrary } from "@/state/LibraryContext";
import { CaptionTrack, StreamSource } from "@/types/provider";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEvent } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Bounded automatic recovery: never an endless retry loop. */
const MAX_RECOVERY_ATTEMPTS = 4;
/** A load that produces no frame for this long is a buffering timeout, not an endless spinner. */
const BUFFER_STALL_TIMEOUT_MS = 30_000;

export function PlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const navigation = useNavigation<Nav>();
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt } = route.params;
  const { saveProgress, progress } = useLibrary();
  const insets = useSafeAreaInsets();
  const isTV = Platform.isTV;

  useKeepAwake();

  const ctx: StreamContext = useMemo(
    () => ({ subjectId, detailPath, season, episode }),
    [subjectId, detailPath, season, episode],
  );

  // Verified full-length sources only; previews are never listed or picked.
  const qualityList = useMemo(() => qualityOptions(sources), [sources]);
  const [source, setSource] = useState<StreamSource | null>(() => selectSource(sources, null));
  const [transport, setTransport] = useState<TransportUri | null>(null);
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
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const lastSavedRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards: a late async response must never overwrite a newer user selection.
  const requestSeqRef = useRef(0);
  const sourceRef = useRef<StreamSource | null>(source);
  sourceRef.current = source;
  const recoveryRef = useRef({ attempts: 0, triedUris: new Set<string>(), running: false });

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

  const initialTransport = useMemo(
    () => (source ? transportChain(source, ctx)[0] : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const player = useVideoPlayer(
    initialTransport ? { uri: initialTransport.uri, headers: initialTransport.headers } : null,
    (p) => {
      p.currentTime = startAt;
      p.play();
    },
  );

  const playing = useEvent(player, "playingChange", { isPlaying: false });
  const statusChange = useEvent(player, "statusChange", { status: "loading" as const, error: undefined });
  const timeUpdate = useEvent(player, "timeUpdate", {
    currentTime: startAt,
    currentLiveTimestamp: null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });

  useEffect(() => {
    setIsPlaying(playing.isPlaying);
    if (playing.isPlaying) setBuffering(false);
  }, [playing]);

  /** Swap in a new transport while preserving the playback position. */
  const applyTransport = useCallback(
    (nextSource: StreamSource, nextTransport: TransportUri, at: number) => {
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      setSource(nextSource);
      setTransport(nextTransport);
      setStatus("loading");
      setBuffering(true);
      setTimeout(() => {
        if (seq !== requestSeqRef.current) return; // a newer selection superseded this one
        player.replace({ uri: nextTransport.uri, headers: nextTransport.headers });
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
   * Bounded recovery across both transports: proxy of the current source →
   * fresh signed URL at the same quality → other verified qualities. The CDN
   * throttles datacenter networks, so a refused direct stream falls over to
   * the server-side proxy transparently. Position is preserved throughout.
   */
  const recover = useCallback(
    async (kind: PlayerErrorKind, detail: string | null) => {
      const state = recoveryRef.current;
      if (state.running) return;
      const current = sourceRef.current;
      const currentTransport = transport;
      if (state.attempts >= MAX_RECOVERY_ATTEMPTS || !current) {
        showError(kind, detail);
        return;
      }
      state.running = true;
      state.attempts += 1;
      const at = player.currentTime;
      const chain = transportChain(current, ctx);
      const currentUri = currentTransport?.uri ?? chain[0]?.uri ?? current.url;
      state.triedUris.add(currentUri);

      const viaProxy = chain[1];
      try {
        // 1. Same source through the proxy (skipped if that is what just failed).
        if (viaProxy && currentTransport?.label !== "proxy" && !state.triedUris.has(viaProxy.uri)) {
          state.triedUris.add(viaProxy.uri);
          state.running = false;
          applyTransport(current, viaProxy, at);
          return;
        }

        // 2/3. Fresh resolve — same quality first, then the default rule.
        const seq = ++requestSeqRef.current;
        const res = await resolveStreams(subjectId, detailPath, season, episode);
        if (seq !== requestSeqRef.current) return; // user acted meanwhile

        const candidates = selectableSources(res.sources).filter((s) => s.url !== current.url);
        const ordered = [
          ...candidates.filter((s) => s.resolution === current.resolution),
          ...candidates.filter((s) => s.resolution !== current.resolution),
        ];
        let picked: { source: StreamSource; transport: TransportUri } | null = null;
        for (const c of ordered) {
          if (picked) break;
          for (const t of transportChain(c, ctx)) {
            if (!state.triedUris.has(t.uri)) {
              state.triedUris.add(t.uri);
              picked = { source: c, transport: t };
              break;
            }
          }
        }
        if (!picked) {
          showError(kind, detail ?? playerErrorMessage(kind));
          return;
        }
        state.running = false;
        applyTransport(picked.source, picked.transport, at);
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
    [player, ctx, season, episode, subjectId, detailPath, applyTransport, showError, transport],
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
    setBufferedPosition(timeUpdate?.bufferedPosition ?? 0);
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

  // Save on unmount (leaving the player).
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
        const res = await fetch(track.url, { headers: transport?.headers });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.text();
        setCues(parseSrt(body));
      } catch {
        setActiveTrack(null);
        setFailMessage("This subtitle track could not be loaded.");
      }
    },
    [transport],
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
      const next = Math.max(0, Math.min(player.duration, player.currentTime + seconds));
      player.currentTime = next;
      showControls();
    },
    [player, showControls],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  /** Explicit user quality choice: resets the recovery budget for the new selection. */
  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      recoveryRef.current = { attempts: 0, triedUris: new Set<string>(), running: false };
      const chain = transportChain(next, ctx);
      const direct = chain[0];
      if (direct) applyTransport(next, direct, player.currentTime);
    },
    [applyTransport, player, ctx],
  );

  /** Manual retry: fresh links, clean budget, back to direct transport. */
  const retry = useCallback(() => {
    setStatus("loading");
    setFailMessage(null);
    recoveryRef.current = { attempts: 0, triedUris: new Set<string>(), running: false };
    if (source) {
      const chain = transportChain(source, ctx);
      const direct = chain[0];
      if (direct) applyTransport(source, direct, player.currentTime);
    } else {
      void recover("expired", null);
    }
  }, [source, applyTransport, player, ctx, recover]);

  const active = source ?? selectSource(sources, null);
  const episodeLabel = mediaType === "series" ? `Season ${season} · Episode ${episode}` : null;

  if (!active) {
    return (
      <View style={styles.root}>
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Nothing to play</Text>
          <Text style={styles.errorMessage}>Only preview clips were returned for this title, and previews cannot be played here.</Text>
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

      {/* Subtitle overlay */}
      {activeTrack && currentCue ? (
        <View style={[styles.subtitleOverlay, { bottom: 96 }]} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentCue.text}</Text>
        </View>
      ) : null}

      {status === "loading" || (buffering && status === "playing") ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.bufferLabel}>
            {transport?.label === "proxy" ? "Streaming via relay…" : "Preparing stream…"}
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

      {controlsVisible && status !== "error" ? (
        <Animated.View style={[styles.chromeWrap, { opacity: controlsOpacity }]} pointerEvents="box-none">
          <PlayerControls
            title={title}
            episodeLabel={episodeLabel}
            transportLabel={transport?.label === "proxy" ? "Relay" : "Streaming"}
            position={position}
            duration={duration}
            buffered={bufferedPosition}
            isPlaying={isPlaying}
            quality={active.resolution}
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

      {/* Quality picker — verified full-length sources only, best-first. */}
      {qualityPickerOpen ? (
        <PickerSheet title="Quality" onClose={() => setQualityPickerOpen(false)}>
          <QualityOptions sources={selectableSources(sources)} activeUri={active.url} onPick={switchSource} />
          {qualityList.length > 0 ? (
            <Text style={styles.pickerNote}>{qualityList.length} full-length qualities available</Text>
          ) : null}
        </PickerSheet>
      ) : null}

      {/* Subtitle picker */}
      {subtitlePickerOpen ? (
        <PickerSheet title="Subtitles" onClose={() => setSubtitlePickerOpen(false)}>
          <SubtitleOptions
            tracks={tracks}
            activeId={activeTrack?.id ?? null}
            offset={subtitleOffset}
            onOffset={setSubtitleOffset}
            onPick={(t) => {
              void selectTrack(t);
              setSubtitlePickerOpen(false);
            }}
            onOff={() => {
              setActiveTrack(null);
              setSubtitlePickerOpen(false);
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
