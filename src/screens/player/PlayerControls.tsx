import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { ChevronLeft, Crop, Gauge, Lock, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, SkipForward, Subtitles, Wifi } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Player chrome — a glass slab that rises into the frame.
 *
 * Every target is measured from the stage, so a 42dp phone button becomes a
 * 100px+ remote target on a television. Focus is drawn as an overlay rim
 * (opacity only) so nothing reflows when the d-pad moves, and the chrome tells
 * the screen whether anything is focused so it never disappears mid-navigation.
 */

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

  // While scrubbing, ignore incoming position updates and seek once, on release.
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

  /** A focus rim drawn on top of a control: opacity only, no layout movement. */
  const rim = (id: string) => (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -3,
        left: -3,
        right: -3,
        bottom: -3,
        borderRadius: 999,
        borderWidth: stage.focusRing,
        borderColor: palette.accent,
        opacity: focused === id ? 1 : 0,
      }}
    />
  );

  const titleSize = Math.round(stage.bodySize + 3);
  const metaSize = Math.max(11, Math.round(stage.metaSize * 1.1));
  const pillSize = Math.max(12, Math.round(stage.bodySize * 0.95));
  const pillPad = {
    paddingHorizontal: stage.tier === "compact" ? 11 : 14,
    paddingVertical: stage.tier === "compact" ? 7 : 9,
  };

  return (
    <View style={styles.chrome} pointerEvents="box-none">
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
          <ChevronLeft size={Math.round(stage.u * 3.8)} color={palette.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
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
          <Lock size={Math.round(stage.u * 3)} color={palette.textSecondary} />
        </Pressable>
        <View style={[styles.transportPill, { paddingHorizontal: stage.tier === "compact" ? 9 : 12 }]}>
          {props.transportLabel === "Offline" ? null : <Wifi size={11} color={palette.textMuted} />}
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
          <RotateCcw size={Math.round(stage.u * 5)} color={palette.textPrimary} />
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
          {isPlaying ? (
            <Pause size={Math.round(stage.u * 6.4)} color="#160B08" fill="#160B08" />
          ) : (
            <Play size={Math.round(stage.u * 6.4)} color="#160B08" fill="#160B08" style={{ marginLeft: 4 }} />
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
          <RotateCw size={Math.round(stage.u * 5)} color={palette.textPrimary} />
          <Text style={[styles.skipLabel, { fontSize: metaSize }]}>10</Text>
        </Pressable>
      </View>

      {/* Bottom: seek + actions */}
      <View style={[styles.bottomStack, { paddingHorizontal: stage.gutter, paddingBottom: stage.gutter }]}>
        <View style={[styles.seekRow, { gap: stage.tier === "compact" ? 8 : 12 }]}>
          <Text style={[styles.timeLabel, { fontSize: metaSize, minWidth: Math.round(stage.u * 7.5) }]}>{fmt(shown)}</Text>
          <View style={styles.trackHit} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
            <View style={styles.track}>
              <View style={[styles.trackBuffered, { width: `${bufferedPct * 100}%` }]} />
              <View style={[styles.trackElapsed, { width: `${pct * 100}%` }]} />
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
            <Text style={[styles.pillText, { fontSize: pillSize }, props.rate !== 1 && { color: palette.accent }]}>
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
            <Subtitles size={Math.round(stage.u * 2.6)} color={props.subtitleLabel ? palette.accent : palette.textSecondary} />
            <Text style={[styles.pillText, { fontSize: pillSize }, props.subtitleLabel && { color: palette.accent }]}>
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
            <Crop size={Math.round(stage.u * 2.6)} color={props.fitMode === "cover" ? palette.accent : palette.textSecondary} />
            <Text style={[styles.pillText, { fontSize: pillSize }, props.fitMode === "cover" && { color: palette.accent }]}>
              {props.fitMode === "cover" ? "Filled" : "Fit"}
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
              style={[styles.pill, pillPad]}
              accessibilityRole="button"
              accessibilityLabel="Next episode"
            >
              {rim("next")}
              <SkipForward size={Math.round(stage.u * 2.6)} color={palette.accent} />
              <Text style={[styles.pillText, { fontSize: pillSize, color: palette.accent }]}>Next episode</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  circleBtn: {
    backgroundColor: "rgba(10,12,16,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(235,242,248,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: { color: palette.textPrimary, fontWeight: "700" },
  episodeText: { color: palette.textMuted, marginTop: 1 },
  transportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(10,12,16,0.62)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  transportText: { color: palette.textMuted, fontWeight: "600" },
  centerRow: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 36 },
  skipBtn: { alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 16 },
  skipLabel: { color: palette.textPrimary, fontWeight: "800", marginTop: -3 },
  playBtn: {
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bottomStack: { gap: 12 },
  seekRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  trackHit: { flex: 1, paddingVertical: 12 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(244,242,237,0.22)",
    overflow: "visible",
    justifyContent: "center",
  },
  trackBuffered: { position: "absolute", left: 0, height: 4, borderRadius: 2, backgroundColor: "rgba(244,242,237,0.35)" },
  trackElapsed: { position: "absolute", left: 0, height: 4, borderRadius: 2, backgroundColor: palette.accent },
  thumb: {
    position: "absolute",
    top: "50%",
    marginTop: -7,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.accent,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  timeLabel: { color: palette.textPrimary, fontVariant: ["tabular-nums"], textAlign: "center" },
  actionsRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10,12,16,0.62)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: { color: palette.textPrimary, fontWeight: "700" },
});
