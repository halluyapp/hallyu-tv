import type { Stage } from "@/design-system/stage";
import { palette, radius, gradients } from "@/design-system/tokens";
import { glowShadow } from "@/design-system/depth";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronLeft,
  Crop,
  Gauge,
  Lock,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Subtitles,
  Tv,
  Wifi,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

export interface PlayerControlsProps {
  title: string;
  episodeLabel: string | null;
  transportLabel: string;
  position: number;
  duration: number;
  buffered: number;
  isPlaying: boolean;
  quality: string | null;
  subtitleLabel: string | null;
  rate: number;
  hasNextEpisode: boolean;
  fitMode: "contain" | "cover";
  pipAvailable: boolean;
  cinemaMode?: boolean;
  onToggleCinema?: () => void;
  stage: Stage;
  onFocusChange?: (focused: boolean) => void;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onBack: () => void;
  onQuality: () => void;
  onSubtitles: () => void;
  onSpeed: () => void;
  onNextEpisode: () => void;
  onToggleFit: () => void;
  onPictureInPicture: () => void;
  onLock: () => void;
}

export function PlayerControls(props: PlayerControlsProps) {
  const { position, duration, buffered, isPlaying, stage } = props;
  const [scrub, setScrub] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [focused, setFocused] = useState<string | null>(null);
  const scrubRef = useRef({ value: 0 });
  const focusCount = useRef(0);

  const shown = scrub ?? Math.min(position, duration || position);
  const total = duration > 0 ? duration : 0;
  const pct = total > 0 ? Math.min(1, shown / total) : 0;
  const bufferedPct = total > 0 ? Math.min(1, Math.max(buffered, shown) / total) : 0;

  const scrubbingRef = useRef(false);
  const totalRef = useRef(total);
  totalRef.current = total;
  const widthRef = useRef(trackWidth);
  widthRef.current = trackWidth;
  const onSeekRef = useRef(props.onSeek);
  onSeekRef.current = props.onSeek;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => totalRef.current > 0,
        onMoveShouldSetPanResponder: () => totalRef.current > 0,
        onPanResponderGrant: (e) => {
          if (totalRef.current <= 0) return;
          scrubbingRef.current = true;
          const value = Math.min(
            totalRef.current,
            Math.max(0, (e.nativeEvent.locationX / Math.max(widthRef.current, 1)) * totalRef.current),
          );
          scrubRef.current = { value };
          setScrub(value);
        },
        onPanResponderMove: (e) => {
          if (totalRef.current <= 0 || !scrubbingRef.current) return;
          const value = Math.min(
            totalRef.current,
            Math.max(0, (e.nativeEvent.locationX / Math.max(widthRef.current, 1)) * totalRef.current),
          );
          scrubRef.current = { value };
          setScrub(value);
        },
        onPanResponderRelease: () => {
          if (scrubbingRef.current) {
            scrubbingRef.current = false;
            onSeekRef.current(scrubRef.current.value);
            setScrub(null);
          }
        },
        onPanResponderTerminate: () => {
          scrubbingRef.current = false;
          setScrub(null);
        },
      }),
    [],
  );

  const handleFocus = (id: string) => {
    focusCount.current += 1;
    setFocused(id);
    props.onFocusChange?.(true);
  };

  const handleBlur = () => {
    focusCount.current = Math.max(0, focusCount.current - 1);
    setFocused(null);
    props.onFocusChange?.(focusCount.current > 0);
  };

  const rim = (id: string) => (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: radius.pill,
        borderWidth: stage.focusRing,
        borderColor: palette.accentBright,
        opacity: focused === id ? 1 : 0,
      }}
    />
  );

  const titleSize = Math.round(stage.bodySize + 3);
  const metaSize = Math.max(11, Math.round(stage.metaSize * 1.1));
  const pillSize = Math.max(12, Math.round(stage.bodySize * 0.95));
  const pillPad = {
    paddingHorizontal: stage.tier === "compact" ? 12 : 16,
    paddingVertical: stage.tier === "compact" ? 8 : 10,
  };

  return (
    <View style={styles.chrome} pointerEvents="box-none">
      {/* Top Scrim */}
      <LinearGradient
        colors={["rgba(4, 6, 10, 0.85)", "rgba(4, 6, 10, 0.4)", "transparent"]}
        locations={[0, 0.6, 1]}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingHorizontal: stage.gutter, paddingTop: stage.gutter }]}>
        <Pressable
          onPress={props.onBack}
          onFocus={() => handleFocus("back")}
          onBlur={handleBlur}
          hasTVPreferredFocus={stage.remote}
          style={[styles.circleBtn, { width: stage.controlSize, height: stage.controlSize, borderRadius: stage.controlSize / 2 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          {rim("back")}
          <ChevronLeft size={Math.round(stage.u * 3.8)} color="#FFFFFF" />
        </Pressable>

        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Text numberOfLines={1} style={[styles.titleText, { fontSize: titleSize }]}>
            {props.title}
          </Text>
          {props.episodeLabel ? (
            <Text style={[styles.episodeText, { fontSize: metaSize }]}>{props.episodeLabel}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={props.onLock}
          onFocus={() => handleFocus("lock")}
          onBlur={handleBlur}
          style={[styles.circleBtn, { width: stage.controlSize, height: stage.controlSize, borderRadius: stage.controlSize / 2 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Lock controls"
        >
          {rim("lock")}
          <Lock size={Math.round(stage.u * 2.8)} color={palette.textSecondary} />
        </Pressable>

        {props.onToggleCinema ? (
          <Pressable
            onPress={props.onToggleCinema}
            onFocus={() => handleFocus("cinema")}
            onBlur={handleBlur}
            style={[styles.circleBtn, props.cinemaMode && styles.circleBtnActive, { width: stage.controlSize, height: stage.controlSize, borderRadius: stage.controlSize / 2 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={props.cinemaMode ? "Turn cinema mode off" : "Turn cinema mode on"}
          >
            {rim("cinema")}
            <Tv size={Math.round(stage.u * 2.8)} color={props.cinemaMode ? palette.accentBright : palette.textSecondary} />
          </Pressable>
        ) : null}

        <View style={[styles.transportPill, { paddingHorizontal: stage.tier === "compact" ? 10 : 14 }]}>
          {props.transportLabel === "Offline" ? null : <Wifi size={11} color={palette.accentBright} />}
          <Text style={[styles.transportText, { fontSize: metaSize }]}>{props.transportLabel}</Text>
        </View>
      </View>

      {/* Center transport */}
      <View style={styles.centerRow} pointerEvents="box-none">
        <Pressable
          onPress={() => props.onSkip(-10)}
          onFocus={() => handleFocus("back10")}
          onBlur={handleBlur}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Back 10 seconds"
        >
          {rim("back10")}
          <RotateCcw size={Math.round(stage.u * 4.8)} color="#FFFFFF" />
          <Text style={[styles.skipLabel, { fontSize: metaSize }]}>10</Text>
        </Pressable>

        <Pressable
          onPress={props.onTogglePlay}
          onFocus={() => handleFocus("play")}
          onBlur={handleBlur}
          style={[styles.playBtn, { width: stage.playerButton, height: stage.playerButton, borderRadius: stage.playerButton / 2 }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          {rim("play")}
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {isPlaying ? (
            <Pause size={Math.round(stage.u * 6.2)} color="#FFFFFF" fill="#FFFFFF" />
          ) : (
            <Play size={Math.round(stage.u * 6.2)} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 4 }} />
          )}
        </Pressable>

        <Pressable
          onPress={() => props.onSkip(10)}
          onFocus={() => handleFocus("fwd10")}
          onBlur={handleBlur}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Forward 10 seconds"
        >
          {rim("fwd10")}
          <RotateCw size={Math.round(stage.u * 4.8)} color="#FFFFFF" />
          <Text style={[styles.skipLabel, { fontSize: metaSize }]}>10</Text>
        </Pressable>
      </View>

      {/* Bottom Scrim */}
      <LinearGradient
        colors={["transparent", "rgba(4, 6, 10, 0.4)", "rgba(4, 6, 10, 0.92)"]}
        locations={[0, 0.4, 1]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Bottom: seek + actions */}
      <View style={[styles.bottomStack, { paddingHorizontal: stage.gutter, paddingBottom: stage.gutter + 4 }]}>
        <View style={[styles.seekRow, { gap: stage.tier === "compact" ? 10 : 14 }]}>
          <Text style={[styles.timeLabel, { fontSize: metaSize, minWidth: Math.round(stage.u * 7.5) }]}>
            {fmt(shown)}
          </Text>

          <View style={styles.trackHit} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
            <View style={styles.track}>
              <View style={[styles.trackBuffered, { width: `${bufferedPct * 100}%` }]} />
              <View style={[styles.trackElapsed, { width: `${pct * 100}%` }]}>
                <LinearGradient
                  colors={gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
              <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
            </View>
          </View>

          <Text style={[styles.timeLabel, { fontSize: metaSize, minWidth: Math.round(stage.u * 7.5) }]}>
            {total > 0 ? fmt(total) : "--:--"}
          </Text>
        </View>

        <View style={[styles.actionsRow, { gap: stage.cardGap }]}>
          <Pressable
            onPress={props.onSpeed}
            onFocus={() => handleFocus("speed")}
            onBlur={handleBlur}
            style={[styles.pill, pillPad]}
            accessibilityRole="button"
            accessibilityLabel="Playback speed"
          >
            {rim("speed")}
            <Text style={[styles.pillText, { fontSize: pillSize }, props.rate !== 1 && { color: palette.accentBright }]}>
              {props.rate === 1 ? "1×" : `${props.rate}×`}
            </Text>
          </Pressable>

          <Pressable
            onPress={props.onSubtitles}
            onFocus={() => handleFocus("subs")}
            onBlur={handleBlur}
            style={[styles.pill, pillPad]}
            accessibilityRole="button"
            accessibilityLabel="Subtitles and audio"
          >
            {rim("subs")}
            <Subtitles size={Math.round(stage.u * 2.6)} color={props.subtitleLabel ? palette.accentBright : palette.textSecondary} />
            <Text style={[styles.pillText, { fontSize: pillSize }, props.subtitleLabel && { color: palette.accentBright }]}>
              {props.subtitleLabel ?? "Subtitles"}
            </Text>
          </Pressable>

          <Pressable
            onPress={props.onQuality}
            onFocus={() => handleFocus("quality")}
            onBlur={handleBlur}
            style={[styles.pill, pillPad]}
            accessibilityRole="button"
            accessibilityLabel="Quality"
          >
            {rim("quality")}
            <Gauge size={Math.round(stage.u * 2.6)} color={palette.textSecondary} />
            <Text style={[styles.pillText, { fontSize: pillSize }]}>{props.quality ?? "Auto"}</Text>
          </Pressable>

          <Pressable
            onPress={props.onToggleFit}
            onFocus={() => handleFocus("fit")}
            onBlur={handleBlur}
            style={[styles.pill, pillPad]}
            accessibilityRole="button"
            accessibilityLabel={props.fitMode === "cover" ? "Switch to fit screen" : "Crop to fill screen"}
          >
            {rim("fit")}
            <Crop size={Math.round(stage.u * 2.6)} color={props.fitMode === "cover" ? palette.accentBright : palette.textSecondary} />
            <Text style={[styles.pillText, { fontSize: pillSize }, props.fitMode === "cover" && { color: palette.accentBright }]}>
              {props.fitMode === "cover" ? "Fill" : "Fit"}
            </Text>
          </Pressable>

          {props.pipAvailable ? (
            <Pressable
              onPress={props.onPictureInPicture}
              onFocus={() => handleFocus("pip")}
              onBlur={handleBlur}
              style={[styles.pill, pillPad]}
              accessibilityRole="button"
              accessibilityLabel="Picture in picture"
            >
              {rim("pip")}
              <PictureInPicture2 size={Math.round(stage.u * 2.6)} color={palette.textSecondary} />
              <Text style={[styles.pillText, { fontSize: pillSize }]}>PiP</Text>
            </Pressable>
          ) : null}

          {props.hasNextEpisode ? (
            <Pressable
              onPress={props.onNextEpisode}
              onFocus={() => handleFocus("next")}
              onBlur={handleBlur}
              style={[styles.pill, pillPad, { borderColor: palette.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Next episode"
            >
              {rim("next")}
              <SkipForward size={Math.round(stage.u * 2.6)} color={palette.accentBright} />
              <Text style={[styles.pillText, { fontSize: pillSize, color: palette.accentBright }]}>Next episode</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, zIndex: 1 },
  circleBtnActive: {
    borderColor: palette.accentBright,
    backgroundColor: "rgba(255, 94, 58, 0.22)",
  },
  circleBtn: {
    backgroundColor: "rgba(18, 25, 36, 0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStrokeBright,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: { color: "#FFFFFF", fontWeight: "700" },
  episodeText: { color: palette.textSecondary, marginTop: 2 },
  transportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 5,
  },
  transportText: { color: palette.textSecondary, fontWeight: "600" },
  centerRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  skipBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skipLabel: { color: "#FFFFFF", fontWeight: "800", marginTop: -2 },
  playBtn: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderWidth: 1,
    ...glowShadow(palette.accent, 22),
  },
  bottomStack: { gap: 14, zIndex: 1 },
  seekRow: { flexDirection: "row", alignItems: "center" },
  trackHit: { flex: 1, paddingVertical: 14 },
  track: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    overflow: "visible",
    justifyContent: "center",
  },
  trackBuffered: {
    position: "absolute",
    left: 0,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  trackElapsed: {
    position: "absolute",
    left: 0,
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: "50%",
    marginTop: -8,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderColor: palette.accent,
    borderWidth: 2,
    shadowColor: palette.accent,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  timeLabel: { color: palette.textPrimary, fontVariant: ["tabular-nums"], textAlign: "center", fontWeight: "600" },
  actionsRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(18, 25, 36, 0.76)",
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  pillText: { color: palette.textPrimary, fontWeight: "600" },
});
