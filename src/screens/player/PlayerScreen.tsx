import { Button } from "@/components/ui/Button";
import { useGate } from "@/components/auth/GateProvider";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchCaptions, resolveStreams } from "@/services/provider/adapter";
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

type PlayerFailure =
  | "loading"
  | "source_invalid"
  | "expired"
  | "network"
  | "decoder"
  | "none";

export function PlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const navigation = useNavigation<Nav>();
  const { subjectId, detailPath, title, mediaType, season, episode, sources, resumeAt } = route.params;
  const { user } = useAuth();
  const { saveProgress, progress } = useLibrary();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  useKeepAwake();

  const [source, setSource] = useState<StreamSource>(() => sources[Math.max(0, sources.length - 1)]!);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [failure, setFailure] = useState<PlayerFailure>("none");
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
    { uri: source.url, headers: PROVIDER_MEDIA_HEADERS },
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

  useEffect(() => {
    setBuffering(statusChange.status === "loading");
    if (statusChange.status === "readyToPlay") {
      setStatus("playing");
      setFailure("none");
    } else if (statusChange.status === "error") {
      setStatus("error");
      setFailure("decoder");
      setFailMessage("The video could not be decoded on this device.");
    }
  }, [statusChange]);

  useEffect(() => {
    const t = timeUpdate?.currentTime ?? position;
    const d = player.duration;
    setPosition(t);
    if (d > 0) setDuration(d);
    if (activeTrack) setCurrentCue(cueAt(cues, t * 1000, subtitleOffset * 1000));

    // Debounced progress persistence: every 10s of playback, plus near-completion.
    if (user && t - lastSavedRef.current >= 10) {
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
  }, [timeUpdate, player, position, activeTrack, cues, subtitleOffset, user, subjectId, detailPath, mediaType, title, season, episode, saveProgress, route.params]);

  // Save on unmount (leaving the player) and when completed.
  useEffect(() => {
    return () => {
      const t = player.currentTime;
      const d = player.duration;
      if (user && t > 3) {
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
  }, [player, user]);

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

  const switchSource = useCallback(
    (next: StreamSource) => {
      setQualityPickerOpen(false);
      const at = player.currentTime;
      // Preserve playback position across quality switch.
      setTimeout(() => {
        player.replace({ uri: next.url, headers: PROVIDER_MEDIA_HEADERS });
        player.currentTime = at;
        player.play();
      }, 0);
      setSource(next);
    },
    [player],
  );

  const retry = useCallback(() => {
    setStatus("loading");
    setFailure("none");
    void resolveStreams(subjectId, detailPath, season, episode)
      .then((res) => {
        const fresh = res.sources.find((s) => s.resolution === source.resolution) ?? res.sources[0];
        if (!fresh) {
          setFailure("source_invalid");
          setFailMessage(res.note ?? "No stream is available for this selection.");
          setStatus("error");
          return;
        }
        const at = player.currentTime;
        player.replace({ uri: fresh.url, headers: PROVIDER_MEDIA_HEADERS });
        player.currentTime = at;
        player.play();
        setSource(fresh);
      })
      .catch(() => {
        setFailure("expired");
        setFailMessage("The stream link expired and could not be refreshed.");
        setStatus("error");
      });
  }, [subjectId, detailPath, season, episode, source, player]);

  const landscape = width > height;

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
              <Text style={styles.bottomLabel}>{source.resolution}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Quality picker */}
      {qualityPickerOpen ? (
        <Sheet title="Quality" onClose={() => setQualityPickerOpen(false)}>
          {sources.map((s) => (
            <Pressable key={s.url} style={[styles.option, s.url === source.url && styles.optionActive]} onPress={() => switchSource(s)}>
              <Text style={styles.optionTitle}>{s.resolution}</Text>
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
