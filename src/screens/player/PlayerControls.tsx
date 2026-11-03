import { palette, radius, spacing } from "@/design-system/tokens";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronLeft,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Subtitles,
  Wifi,
} from "lucide-react-native";

/**
 * Player chrome: top bar, transport controls, seek bar with a buffered layer,
 * and the quality/subtitle entry points. Hides itself while playing; any tap
 * brings it back. All times are seconds.
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
  isTV: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onBack: () => void;
  onQuality: () => void;
  onSubtitles: () => void;
}

export function PlayerControls(props: PlayerControlsProps) {
  const { position, duration, buffered, isPlaying, isTV } = props;
  const [scrub, setScrub] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [focused, setFocused] = useState<string | null>(null);
  const scrubRef = useRef({ value: 0 });
  const pendingSeek = useRef<number | null>(null);

  // While scrubbing, ignore incoming position updates and seek once, on release.
  const shown = scrub ?? Math.min(position, duration || position);
  const total = duration > 0 ? duration : 0;
  const pct = total > 0 ? Math.min(1, shown / total) : 0;
  const bufferedPct = total > 0 ? Math.min(1, Math.max(buffered, shown) / total) : 0;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (total <= 0) return;
          scrubRef.current = { value: Math.min(total, Math.max(0, (e.nativeEvent.locationX / Math.max(trackWidth, 1)) * total)) };
          setScrub(scrubRef.current.value);
        },
        onPanResponderMove: (e) => {
          if (total <= 0 || scrub === null) return;
          scrubRef.current = { value: Math.min(total, Math.max(0, (e.nativeEvent.locationX / Math.max(trackWidth, 1)) * total)) };
          setScrub(scrubRef.current.value);
        },
        onPanResponderRelease: () => {
          if (total > 0 && scrub !== null) {
            pendingSeek.current = scrubRef.current.value;
            setScrub(null);
          }
        },
        onPanResponderTerminate: () => setScrub(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, trackWidth, scrub !== null],
  );

  useEffect(() => {
    if (pendingSeek.current !== null) {
      const t = pendingSeek.current;
      pendingSeek.current = null;
      props.onSeek(t);
    }
  }, [scrub]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusStyle = (id: string) => (isTV && focused === id ? styles.focused : null);

  return (
    <View style={styles.chrome} pointerEvents="box-none">
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={props.onBack}
          onFocus={() => setFocused("back")}
          onBlur={() => setFocused(null)}
          hasTVPreferredFocus={isTV}
          style={[styles.circleBtn, focusStyle("back")]}
          hitSlop={8}
        >
          <ChevronLeft size={22} color={palette.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.titleText}>{props.title}</Text>
          {props.episodeLabel ? <Text style={styles.episodeText}>{props.episodeLabel}</Text> : null}
        </View>
        <View style={styles.transportPill}>
          {props.transportLabel === "Offline" ? null : <Wifi size={11} color={palette.textMuted} />}
          <Text style={styles.transportText}>{props.transportLabel}</Text>
        </View>
      </View>

      {/* Center transport */}
      <View style={styles.centerRow} pointerEvents="box-none">
        <Pressable
          onPress={() => props.onSkip(-10)}
          onFocus={() => setFocused("back10")}
          onBlur={() => setFocused(null)}
          style={[styles.skipBtn, focusStyle("back10")]}
        >
          <RotateCcw size={24} color={palette.textPrimary} />
          <Text style={styles.skipLabel}>10</Text>
        </Pressable>
        <Pressable
          onPress={props.onTogglePlay}
          onFocus={() => setFocused("play")}
          onBlur={() => setFocused(null)}
          style={[styles.playBtn, focusStyle("play")]}
        >
          {isPlaying ? (
            <Pause size={30} color="#160B08" fill="#160B08" />
          ) : (
            <Play size={30} color="#160B08" fill="#160B08" style={{ marginLeft: 3 }} />
          )}
        </Pressable>
        <Pressable
          onPress={() => props.onSkip(10)}
          onFocus={() => setFocused("fwd10")}
          onBlur={() => setFocused(null)}
          style={[styles.skipBtn, focusStyle("fwd10")]}
        >
          <RotateCw size={24} color={palette.textPrimary} />
          <Text style={styles.skipLabel}>10</Text>
        </Pressable>
      </View>

      {/* Bottom: seek + actions */}
      <View style={styles.bottomStack}>
        <View style={styles.seekRow}>
          <Text style={styles.timeLabel}>{fmt(shown)}</Text>
          <View
            style={styles.trackHit}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            {...pan.panHandlers}
          >
            <View style={styles.track}>
              <View style={[styles.trackBuffered, { width: `${bufferedPct * 100}%` }]} />
              <View style={[styles.trackElapsed, { width: `${pct * 100}%` }]} />
              <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
            </View>
          </View>
          <Text style={styles.timeLabel}>{total > 0 ? fmt(total) : "--:--"}</Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={props.onSubtitles}
            onFocus={() => setFocused("subs")}
            onBlur={() => setFocused(null)}
            style={[styles.pill, focusStyle("subs")]}
          >
            <Subtitles size={14} color={props.subtitleLabel ? palette.accent : palette.textSecondary} />
            <Text style={[styles.pillText, props.subtitleLabel && { color: palette.accent }]}>
              {props.subtitleLabel ?? "Subtitles"}
            </Text>
          </Pressable>
          <Pressable
            onPress={props.onQuality}
            onFocus={() => setFocused("quality")}
            onBlur={() => setFocused(null)}
            style={[styles.pill, focusStyle("quality")]}
          >
            <Gauge size={14} color={palette.textSecondary} />
            <Text style={styles.pillText}>{props.quality ?? "Auto"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(10,12,16,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: { color: palette.textPrimary, fontSize: 16, fontWeight: "700" },
  episodeText: { color: palette.textMuted, fontSize: 12, marginTop: 1 },
  transportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(10,12,16,0.62)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  transportText: { color: palette.textMuted, fontSize: 11, fontWeight: "600" },
  centerRow: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 36 },
  skipBtn: { alignItems: "center", justifyContent: "center", padding: 10, borderRadius: radius.md },
  skipLabel: { color: palette.textPrimary, fontSize: 9, fontWeight: "800", marginTop: -3 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bottomStack: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  seekRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
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
  timeLabel: { color: palette.textPrimary, fontSize: 11, fontVariant: ["tabular-nums"], minWidth: 44, textAlign: "center" },
  actionsRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10,12,16,0.62)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: { color: palette.textPrimary, fontSize: 12, fontWeight: "700" },
  focused: { borderWidth: 2, borderColor: palette.accent, borderRadius: radius.pill, backgroundColor: "rgba(240,120,85,0.18)" },
});
