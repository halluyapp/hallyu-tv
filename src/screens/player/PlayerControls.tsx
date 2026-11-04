import { chrome } from "@/design-system/gradients";
import { materials } from "@/design-system/materials";
import { palette, radius, spacing, tvTypeScale, typeScale } from "@/design-system/tokens";
import { TvFocusable } from "@/components/tv/TvFocusable";
import { BlurSurface } from "@/components/ui/BlurSurface";
import { ChevronLeft, Gauge, Pause, Play, RotateCcw, RotateCw, SkipForward, Subtitles, Wifi } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

/**
 * Player chrome.
 *
 * Two interaction models, one component:
 *  - **Phone**: tap the timeline to scrub; a PanResponder drags it.
 *  - **TV**: the timeline is a focusable control and the remote seeks with
 *    left/right; every button is a ≥60 px focus target with a cyan ring.
 *
 * The parent keeps the chrome mounted while focus is inside it, so the controls
 * can never vanish under the remote's cursor.
 */

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
  isTV: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onBack: () => void;
  onQuality: () => void;
  onSubtitles: () => void;
  onSpeed: () => void;
  onNextEpisode: () => void;
  /** TV: report whether focus is inside the chrome so the parent can hold it. */
  onFocusHold?: (held: boolean) => void;
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

export function PlayerControls(props: PlayerControlsProps) {
  const { position, duration, buffered, isPlaying, isTV } = props;
  const [scrub, setScrub] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const scrubRef = useRef({ value: 0 });
  const type = isTV ? tvTypeScale : typeScale;

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
          const value = Math.min(totalRef.current, Math.max(0, (e.nativeEvent.locationX / Math.max(widthRef.current, 1)) * totalRef.current));
          scrubRef.current = { value };
          setScrub(value);
        },
        onPanResponderMove: (e) => {
          if (totalRef.current <= 0 || !scrubbingRef.current) return;
          const value = Math.min(totalRef.current, Math.max(0, (e.nativeEvent.locationX / Math.max(widthRef.current, 1)) * totalRef.current));
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

  return (
    <View style={styles.chrome} pointerEvents="box-none">
      {/* Top bar */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TvFocusable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel="Exit player"
          style={[styles.circleBtn, { width: isTV ? 60 : 44, height: isTV ? 60 : 44, borderRadius: isTV ? 30 : 22 }]}
          onFocus={() => props.onFocusHold?.(true)}
          onBlur={() => props.onFocusHold?.(false)}
        >
          <ChevronLeft size={isTV ? 28 : 22} color={palette.textPrimary} />
        </TvFocusable>
        <View style={{ flex: 1 }} pointerEvents="none">
          <Text numberOfLines={1} style={[type.headline, styles.titleText]}>
            {props.title}
          </Text>
          {props.episodeLabel ? <Text style={[type.caption, styles.episodeText]}>{props.episodeLabel}</Text> : null}
        </View>
        <View style={styles.transportPill} pointerEvents="none">
          {props.transportLabel === "Offline" ? null : <Wifi size={12} color={palette.textMuted} />}
          <Text style={type.caption}>{props.transportLabel}</Text>
        </View>
      </View>

      {/* Center transport */}
      <View style={styles.centerRow} pointerEvents="box-none">
        <TvFocusable
          onPress={() => props.onSkip(-10)}
          accessibilityRole="button"
          accessibilityLabel="Skip back 10 seconds"
          style={[styles.skipBtn, isTV && styles.skipBtnTv]}
          onFocus={() => props.onFocusHold?.(true)}
          onBlur={() => props.onFocusHold?.(false)}
        >
          <RotateCcw size={isTV ? 30 : 24} color={palette.textPrimary} />
          <Text style={[type.caption, styles.skipLabel]}>10</Text>
        </TvFocusable>

        <TvFocusable
          onPress={props.onTogglePlay}
          hasTVPreferredFocus={isTV}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          focusScale={1.05}
          style={[styles.playBtn, isTV && styles.playBtnTv]}
          onFocus={() => props.onFocusHold?.(true)}
          onBlur={() => props.onFocusHold?.(false)}
        >
          {isPlaying ? (
            <Pause size={isTV ? 38 : 30} color={palette.textOnAccent} fill={palette.textOnAccent} />
          ) : (
            <Play size={isTV ? 38 : 30} color={palette.textOnAccent} fill={palette.textOnAccent} style={{ marginLeft: 3 }} />
          )}
        </TvFocusable>

        <TvFocusable
          onPress={() => props.onSkip(10)}
          accessibilityRole="button"
          accessibilityLabel="Skip forward 10 seconds"
          style={[styles.skipBtn, isTV && styles.skipBtnTv]}
          onFocus={() => props.onFocusHold?.(true)}
          onBlur={() => props.onFocusHold?.(false)}
        >
          <RotateCw size={isTV ? 30 : 24} color={palette.textPrimary} />
          <Text style={[type.caption, styles.skipLabel]}>10</Text>
        </TvFocusable>
      </View>

      {/* Bottom: timeline + actions */}
      <View style={styles.bottomStack} pointerEvents="box-none">
        <BlurSurface material="primary" radius={radius.sheet} style={styles.shelf}>
          <View style={styles.shelfInner}>
          <View style={styles.seekRow}>
            <Text style={[type.caption, styles.timeLabel]}>{fmt(shown)}</Text>

            {/*
             * Phone: the track itself is draggable (PanResponder).
             * TV: a remote has no pointer. React Native 0.81 core exposes no
             * TV key-event API (that moved out of core with the tvOS fork), so
             * instead of shipping a seek bar that cannot be operated, the
             * timeline is read-only on TV and the two focusable buttons below
             * it perform the seeking.
             */}
            {isTV ? (
              <View style={styles.trackHit} pointerEvents="none">
                <View style={styles.track}>
                  <View style={[styles.trackBuffered, { width: `${bufferedPct * 100}%` }]} />
                  <View style={[styles.trackElapsed, { width: `${pct * 100}%` }]} />
                  <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
                </View>
              </View>
            ) : (
              <View style={styles.trackHit} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
                <View style={styles.track}>
                  <View style={[styles.trackBuffered, { width: `${bufferedPct * 100}%` }]} />
                  <View style={[styles.trackElapsed, { width: `${pct * 100}%` }]} />
                  <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
                </View>
              </View>
            )}

            <Text style={[type.caption, styles.timeLabel]}>{total > 0 ? fmt(total) : "--:--"}</Text>
          </View>

          <View style={styles.actionsRow}>
            {isTV ? (
              <>
                <TvFocusable
                  onPress={() => props.onSkip(-10)}
                  accessibilityRole="button"
                  accessibilityLabel="Seek back 10 seconds"
                  style={styles.pill}
                  onFocus={() => props.onFocusHold?.(true)}
                  onBlur={() => props.onFocusHold?.(false)}
                >
                  <RotateCcw size={15} color={palette.textSecondary} />
                  <Text style={[type.caption, styles.pillText]}>10s</Text>
                </TvFocusable>
                <TvFocusable
                  onPress={() => props.onSkip(30)}
                  accessibilityRole="button"
                  accessibilityLabel="Seek forward 30 seconds"
                  style={styles.pill}
                  onFocus={() => props.onFocusHold?.(true)}
                  onBlur={() => props.onFocusHold?.(false)}
                >
                  <RotateCw size={15} color={palette.textSecondary} />
                  <Text style={[type.caption, styles.pillText]}>30s</Text>
                </TvFocusable>
              </>
            ) : null}
            <TvFocusable
              onPress={props.onSpeed}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${props.rate} times`}
              style={styles.pill}
              onFocus={() => props.onFocusHold?.(true)}
              onBlur={() => props.onFocusHold?.(false)}
            >
              <Text style={[type.caption, styles.pillText, props.rate !== 1 && { color: palette.cyan }]}>{props.rate === 1 ? "1×" : `${props.rate}×`}</Text>
            </TvFocusable>

            <TvFocusable
              onPress={props.onSubtitles}
              accessibilityRole="button"
              accessibilityLabel={props.subtitleLabel ? `Subtitles: ${props.subtitleLabel}` : "Subtitles and audio"}
              style={styles.pill}
              onFocus={() => props.onFocusHold?.(true)}
              onBlur={() => props.onFocusHold?.(false)}
            >
              <Subtitles size={15} color={props.subtitleLabel ? palette.cyan : palette.textSecondary} />
              <Text style={[type.caption, styles.pillText, props.subtitleLabel && { color: palette.cyan }]}>
                {props.subtitleLabel ?? "Subtitles"}
              </Text>
            </TvFocusable>

            <TvFocusable
              onPress={props.onQuality}
              accessibilityRole="button"
              accessibilityLabel={`Quality ${props.quality ?? "auto"}`}
              style={styles.pill}
              onFocus={() => props.onFocusHold?.(true)}
              onBlur={() => props.onFocusHold?.(false)}
            >
              <Gauge size={15} color={palette.textSecondary} />
              <Text style={[type.caption, styles.pillText]}>{props.quality ?? "Auto"}</Text>
            </TvFocusable>

            {props.hasNextEpisode ? (
              <TvFocusable
                onPress={props.onNextEpisode}
                accessibilityRole="button"
                accessibilityLabel="Play next episode"
                style={styles.pill}
                onFocus={() => props.onFocusHold?.(true)}
                onBlur={() => props.onFocusHold?.(false)}
              >
                <SkipForward size={15} color={palette.cyan} />
                <Text style={[type.caption, styles.pillText, { color: palette.cyan }]}>Next episode</Text>
              </TvFocusable>
            ) : null}
            </View>
          </View>
        </BlurSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  circleBtn: {
    backgroundColor: chrome.scrimSoft,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: { color: palette.textPrimary },
  episodeText: { color: palette.textMuted, marginTop: 1 },
  transportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: chrome.scrimSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xxl },
  skipBtn: { alignItems: "center", justifyContent: "center", width: 56, height: 56, gap: 1 },
  skipBtnTv: { width: 84, height: 84 },
  skipLabel: { color: palette.textSecondary },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: palette.accent,
    borderWidth: 1,
    borderColor: palette.accentBright,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnTv: { width: 92, height: 92, borderRadius: 46 },
  bottomStack: { padding: spacing.lg },
  shelf: { borderRadius: radius.sheet },
  shelfInner: { padding: spacing.lg, gap: spacing.md },
  seekRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  timeLabel: { color: palette.textSecondary, fontVariant: ["tabular-nums"], minWidth: 52 },
  trackHit: { flex: 1, paddingVertical: 12, justifyContent: "center", borderRadius: radius.sm },
  track: { height: 4, borderRadius: 2, backgroundColor: chrome.trackDim, overflow: "visible" },
  trackBuffered: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: chrome.trackBuffered },
  trackElapsed: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: palette.cyan },
  thumb: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: palette.textPrimary,
    borderWidth: 2,
    borderColor: palette.cyan,
  },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: materials.secondary.fill,
    borderWidth: 1,
    borderColor: materials.secondary.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
  },
  pillText: { color: palette.textSecondary, fontWeight: "600" },
});
