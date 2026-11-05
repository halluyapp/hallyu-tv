import Slider from "@react-native-community/slider";
import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { VideoView } from "expo-video";
import {
  ArrowLeft,
  FastForward,
  ListVideo,
  Lock,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  SkipForward,
  Subtitles,
  Unlock,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileStackParamList } from "@/apps/mobile/navigation/mobileTypes";
import { motion } from "@/design-system/motion";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { usePlaybackEngine } from "@/services/player/usePlaybackEngine";
import { takePrefetched } from "@/services/provider/prefetch";
import { formatDuration } from "@/utils/format";
import { GlassIconButton, GlassPillButton } from "@/ui/glass/GlassButton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type Nav = NativeStackNavigationProp<MobileStackParamList>;
type PlayerRoute = RouteProp<MobileStackParamList, "MobilePlayer">;

type MobileSheetKind = "episodes" | "subtitles" | "quality" | "speed" | null;

/**
 * 1:1 Hallyu Mobile Landscape Touch Liquid Glass Player (`docs/ui-previews/mobile-04-player.png`):
 * - Automatically locks to Landscape on mount & restores Portrait on exit
 * - Top-left compact floating Frosted Liquid Glass pill ('< Back | Title · S1 E3')
 *   and top-right circular Frosted Liquid Glass 'Lock' button — zero heavy dark top bar!
 * - Single tap toggles HUD; double-tap left/right skips ±10s with subtle floating glass pill;
 *   horizontal swipe scrubs; long-press right holds 2x speed
 * - Hovering Floating Translucent Liquid Glass Bottom Control Capsule with touch scrubber + compact glass pills
 */
export function MobilePlayerScreen() {
  const route = useRoute<PlayerRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const params = route.params;

  const videoRef = useRef<VideoView>(null);

  // Lock to landscape for cinema playback, unlock back to portrait on unmount
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const navigateEpisode = useCallback(
    (nextSe: number, nextEp: number) => {
      const maxEp = params.maxEpisodesInSeason ?? 0;
      navigation.replace("MobilePlayer", {
        ...params,
        season: nextSe,
        episode: nextEp,
        resumeAt: 0,
        sources: takePrefetched(params.subjectId, params.detailPath, nextSe, nextEp)?.sources ?? [],
        nextEpisode: maxEp === 0 || nextEp < maxEp ? { season: nextSe, episode: nextEp + 1 } : null,
      });
    },
    [navigation, params],
  );

  const engine = usePlaybackEngine(params, navigateEpisode);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [sheet, setSheet] = useState<MobileSheetKind>(null);
  const [gesturePill, setGesturePill] = useState<{ text: string; side: "left" | "center" | "right" } | null>(null);
  const [scrubValue, setScrubValue] = useState<number | null>(null);

  const hudOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ at: number; zone: "left" | "center" | "right" } | null>(null);
  const pressZoneRef = useRef<"left" | "center" | "right">("center");
  const dragStartRef = useRef({ x: 0, pos: 0 });
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const prevRateRef = useRef(1);
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;

  const flashGesture = useCallback((text: string, side: "left" | "center" | "right" = "right") => {
    setGesturePill({ text, side });
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => setGesturePill(null), 780);
  }, []);

  const hideHud = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Animated.timing(hudOpacity, { toValue: 0, duration: motion.fast, useNativeDriver: true }).start(() => {
      setControlsVisible(false);
    });
  }, [hudOpacity]);

  const showHud = useCallback(() => {
    setControlsVisible(true);
    Animated.timing(hudOpacity, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (engine.isPlaying && sheet === null && scrubValue === null) {
        hideHud();
      }
    }, 3800);
  }, [engine.isPlaying, hideHud, hudOpacity, scrubValue, sheet]);

  useEffect(() => {
    showHud();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [showHud]);

  const gestureResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, st) => Math.abs(st.dx) > 12 || Math.abs(st.dy) > 12,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.pageX;
          dragStartRef.current = { x, pos: engine.position };
          pressZoneRef.current = x < stage.width * 0.34 ? "left" : x > stage.width * 0.66 ? "right" : "center";
          prevRateRef.current = engine.rate;
          holdActiveRef.current = false;
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          if (pressZoneRef.current === "right" && engine.isPlaying) {
            holdTimerRef.current = setTimeout(() => {
              holdActiveRef.current = true;
              engine.setPlaybackRate(2);
              flashGesture("2.0× Speed", "right");
            }, 420);
          }
        },
        onPanResponderRelease: (_, st) => {
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          if (holdActiveRef.current) {
            holdActiveRef.current = false;
            engine.setPlaybackRate(prevRateRef.current);
            setGesturePill(null);
            return;
          }
          if (Math.abs(st.dx) > 48 && Math.abs(st.dx) > Math.abs(st.dy) * 1.3) {
            const delta = Math.round((st.dx / Math.max(1, stage.width)) * Math.min(Math.max(engine.duration, 90), 240));
            engine.seekTo(dragStartRef.current.pos + delta);
            flashGesture(`${delta >= 0 ? "+" : "−"}${Math.abs(delta)}s`, delta >= 0 ? "right" : "left");
            showHud();
            return;
          }
          if (Math.abs(st.dx) > 12 || Math.abs(st.dy) > 12) return;

          const zone = pressZoneRef.current;
          const now = Date.now();
          const last = lastTapRef.current;
          if (last && last.zone === zone && now - last.at <= 300) {
            lastTapRef.current = null;
            if (zone === "left") {
              engine.skipBy(-10);
              flashGesture("−10s", "left");
            } else if (zone === "right") {
              engine.skipBy(10);
              flashGesture("+10s", "right");
            } else {
              engine.togglePlay();
              flashGesture(engine.isPlaying ? "Paused" : "Play", "center");
            }
            return;
          }
          lastTapRef.current = { at: now, zone };
          if (controlsVisibleRef.current) {
            hideHud();
          } else {
            showHud();
          }
        },
        onPanResponderTerminate: () => {
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          if (holdActiveRef.current) {
            holdActiveRef.current = false;
            engine.setPlaybackRate(prevRateRef.current);
          }
        },
      }),
    [engine, flashGesture, hideHud, showHud, stage.width],
  );

  const headerTitle =
    params.mediaType === "series" && !params.isTrailer
      ? `${params.title} · S${params.season} E${params.episode}`
      : params.title;

  const episodeNumbers = useMemo(() => {
    const count = Math.max(params.maxEpisodesInSeason ?? 0, params.episode);
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [params.episode, params.maxEpisodesInSeason]);

  const effectivePosition = scrubValue ?? engine.position;
  const qualityText = engine.offline ? "Offline" : engine.source?.resolution ?? "Auto";

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      <View style={StyleSheet.absoluteFill} {...(locked || engine.pipActive ? {} : gestureResponder.panHandlers)}>
        <VideoView
          ref={videoRef}
          player={engine.player}
          style={StyleSheet.absoluteFill}
          contentFit={engine.fitMode}
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={engine.pipSupported}
          onPictureInPictureStart={() => {
            engine.setPipActive(true);
            setControlsVisible(false);
          }}
          onPictureInPictureStop={() => {
            engine.setPipActive(false);
            showHud();
          }}
        />
      </View>

      {/* Clean Subtitles */}
      {engine.activeTrack && engine.currentCue && !engine.pipActive ? (
        <View
          pointerEvents="none"
          style={[
            styles.subtitleWrap,
            { bottom: controlsVisible && !locked ? 118 : 26 },
          ]}
        >
          <Text style={[styles.subtitleText, { fontSize: Math.round(16 * engine.subtitleScale) }]}>
            {engine.currentCue.text}
          </Text>
        </View>
      ) : null}

      {/* Subtle Floating Liquid Glass Gesture Feedback Pill (`+10s`, `-10s`, `2.0x`) */}
      {gesturePill ? (
        <View
          pointerEvents="none"
          style={[
            styles.gestureAnchor,
            gesturePill.side === "left"
              ? { left: 26 }
              : gesturePill.side === "right"
                ? { right: 26 }
                : { alignSelf: "center" },
          ]}
        >
          <LiquidGlassView variant="dock" borderRadius={radius.pill} contentStyle={styles.gestureInner}>
            <Text style={styles.gestureText}>{gesturePill.text}</Text>
          </LiquidGlassView>
        </View>
      ) : null}

      {/* Buffering Indicator */}
      {(engine.status === "loading" || (engine.buffering && engine.status === "ready")) ? (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <ActivityIndicator size="large" color={palette.accentBright} />
        </View>
      ) : null}

      {/* Locked State Pill */}
      {locked ? (
        <View style={[styles.topRightLockOnly, { top: Math.max(14, insets.top + 8), right: Math.max(18, insets.right + 12) }]}>
          <GlassPillButton
            label="Tap to Unlock"
            icon={<Lock size={14} color="#FFFFFF" />}
            size="sm"
            variant="secondary"
            onPress={() => {
              setLocked(false);
              showHud();
            }}
          />
        </View>
      ) : null}

      {/* Next Episode Countdown Pill */}
      {engine.nextCountdown !== null && params.nextEpisode && engine.status !== "error" ? (
        <View style={[styles.nextWrap, { bottom: controlsVisible ? 124 : 26, right: Math.max(20, insets.right + 14) }]}>
          <LiquidGlassView variant="dock" borderRadius={20} contentStyle={styles.nextInner}>
            <Text style={styles.nextText}>
              Next Ep in {engine.nextCountdown}s
            </Text>
            <GlassPillButton
              label="Play"
              size="sm"
              variant="primary"
              onPress={() => {
                engine.saveExitSnapshot();
                navigateEpisode(params.nextEpisode!.season, params.nextEpisode!.episode);
              }}
            />
            <GlassPillButton label="Cancel" size="sm" variant="secondary" onPress={engine.cancelAutoNext} />
          </LiquidGlassView>
        </View>
      ) : null}

      {/* Error Recovery */}
      {engine.status === "error" ? (
        <View style={styles.errorOverlay}>
          <LiquidGlassView variant="dock" borderRadius={26} style={styles.errorCard} contentStyle={styles.errorContent}>
            <Text style={styles.errorTitle}>Stream Interrupted</Text>
            <Text style={styles.errorBody}>{engine.failMessage ?? "Something interrupted this stream."}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <GlassPillButton label="Retry" variant="primary" onPress={engine.retry} />
              <GlassPillButton
                label="Back"
                variant="secondary"
                onPress={() => {
                  engine.saveExitSnapshot();
                  navigation.goBack();
                }}
              />
            </View>
          </LiquidGlassView>
        </View>
      ) : null}

      {/* 1:1 Floating Liquid Glass Top & Bottom HUD (`mobile-04-player.png`) */}
      {controlsVisible && !locked && !engine.pipActive && engine.status !== "error" ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: hudOpacity }]}>
          {/* Top-Left Compact Back|Title Glass Pill + Top-Right Circular Lock Glass Button */}
          <View
            pointerEvents="box-none"
            style={[
              styles.topFloatingRow,
              {
                top: Math.max(12, insets.top + 6),
                left: Math.max(16, insets.left + 12),
                right: Math.max(16, insets.right + 12),
              },
            ]}
          >
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => {
                engine.saveExitSnapshot();
                navigation.goBack();
              }}
              style={{ maxWidth: "74%" }}
            >
              <LiquidGlassView variant="dock" borderRadius={radius.pill} blurIntensity={42} contentStyle={styles.backTitlePill}>
                <ArrowLeft size={16} color="#FFFFFF" />
                <Text style={styles.backLabel}>Back</Text>
                <View style={styles.divider} />
                <Text numberOfLines={1} style={styles.topTitleText}>
                  {headerTitle}
                </Text>
              </LiquidGlassView>
            </Pressable>

            <GlassIconButton
              icon={<Unlock size={18} color="#FFFFFF" />}
              accessibilityLabel="Lock touch controls"
              size={40}
              onPress={() => {
                setLocked(true);
                setControlsVisible(false);
              }}
            />
          </View>

          {/* Bottom Floating Translucent Liquid Glass Control Capsule */}
          <View
            style={[
              styles.bottomDockAnchor,
              {
                left: Math.max(16, insets.left + 12),
                right: Math.max(16, insets.right + 12),
                bottom: Math.max(12, insets.bottom + 6),
              },
            ]}
          >
            <LiquidGlassView
              variant="dock"
              borderRadius={24}
              blurIntensity={46}
              contentStyle={styles.bottomDockInner}
            >
              {/* Scrub Bar Row */}
              <View style={styles.scrubRow}>
                <Text style={styles.timeText}>{formatDuration(effectivePosition)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={Math.max(1, engine.duration)}
                  value={Math.min(Math.max(0, effectivePosition), Math.max(1, engine.duration))}
                  minimumTrackTintColor="#FFFFFF"
                  maximumTrackTintColor="rgba(255, 255, 255, 0.26)"
                  thumbTintColor="#FFFFFF"
                  onSlidingStart={(val) => {
                    setScrubValue(val);
                    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                  }}
                  onValueChange={(val) => setScrubValue(val)}
                  onSlidingComplete={(val) => {
                    setScrubValue(null);
                    engine.seekTo(val);
                    showHud();
                  }}
                />
                <Text style={styles.timeText}>
                  {formatDuration(effectivePosition)} / {formatDuration(engine.duration)}
                </Text>
              </View>

              {/* Compact Frosted Glass Pill Row */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}
              >
                <CompactControlPill
                  icon={engine.isPlaying ? <Pause size={15} color="#FFFFFF" /> : <Play size={15} color="#FFFFFF" />}
                  onPress={() => {
                    engine.togglePlay();
                    showHud();
                  }}
                />
                <CompactControlPill
                  icon={<Rewind size={14} color="#FFFFFF" />}
                  label="-10s"
                  onPress={() => {
                    engine.skipBy(-10);
                    showHud();
                  }}
                />
                <CompactControlPill
                  icon={<FastForward size={14} color="#FFFFFF" />}
                  label="+10s"
                  onPress={() => {
                    engine.skipBy(10);
                    showHud();
                  }}
                />
                {params.nextEpisode && !params.isTrailer ? (
                  <CompactControlPill
                    icon={<SkipForward size={14} color="#FFFFFF" />}
                    onPress={() => {
                      engine.saveExitSnapshot();
                      navigateEpisode(params.nextEpisode!.season, params.nextEpisode!.episode);
                    }}
                  />
                ) : null}

                <View style={{ width: 8 }} />

                {params.mediaType === "series" && !params.isTrailer && episodeNumbers.length > 1 ? (
                  <CompactControlPill
                    icon={<ListVideo size={15} color="#FFFFFF" />}
                    onPress={() => setSheet("episodes")}
                  />
                ) : null}
                {!params.isTrailer ? (
                  <CompactControlPill
                    icon={<Subtitles size={15} color="#FFFFFF" />}
                    label={engine.activeTrack ? engine.activeTrack.language.toUpperCase() : "CC"}
                    onPress={() => {
                      void engine.loadCaptions();
                      engine.refreshNativeTracks();
                      setSheet("subtitles");
                    }}
                  />
                ) : null}
                {!engine.offline && !params.isTrailer ? (
                  <CompactControlPill
                    label={qualityText}
                    onPress={() => setSheet("quality")}
                  />
                ) : null}
                <CompactControlPill
                  label={`${engine.rate.toFixed(1)}x`}
                  onPress={() => setSheet("speed")}
                />
                {engine.pipSupported ? (
                  <CompactControlPill
                    icon={<PictureInPicture2 size={15} color="#FFFFFF" />}
                    onPress={() => {
                      void videoRef.current?.startPictureInPicture().catch(() => {});
                    }}
                  />
                ) : null}
                <CompactControlPill
                  label={engine.fitMode === "contain" ? "Fit" : "Zoom"}
                  onPress={() => {
                    engine.setFitMode(engine.fitMode === "contain" ? "cover" : "contain");
                    showHud();
                  }}
                />
              </ScrollView>
            </LiquidGlassView>
          </View>
        </Animated.View>
      ) : null}

      {/* Liquid Glass Player Picker Modal */}
      <MobilePickerSheet
        visible={sheet !== null}
        title={
          sheet === "episodes"
            ? `Season ${params.season} · Episodes`
            : sheet === "subtitles"
              ? "Subtitles & Audio"
              : sheet === "quality"
                ? "Stream Quality"
                : "Playback Speed"
        }
        onClose={() => {
          setSheet(null);
          showHud();
        }}
      >
        {sheet === "episodes" ? (
          <FlatList
            data={episodeNumbers}
            numColumns={4}
            keyExtractor={(ep) => `ep-${ep}`}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item: epNum }) => (
              <GlassPillButton
                label={`E${epNum}`}
                size="sm"
                variant={epNum === params.episode ? "primary" : "secondary"}
                active={epNum === params.episode}
                onPress={() => {
                  setSheet(null);
                  if (epNum !== params.episode) {
                    engine.saveExitSnapshot();
                    navigateEpisode(params.season, epNum);
                  }
                }}
                style={{ flex: 1 }}
              />
            )}
          />
        ) : null}

        {sheet === "subtitles" ? (
          <ScrollView contentContainerStyle={styles.sheetStack}>
            <View style={styles.sheetInlineRow}>
              <Text style={styles.sheetSubLabel}>
                Delay ({engine.subtitleOffset >= 0 ? `+${engine.subtitleOffset.toFixed(1)}s` : `${engine.subtitleOffset.toFixed(1)}s`})
              </Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <GlassPillButton label="-0.5s" size="sm" onPress={() => engine.setSubtitleOffset(Number((engine.subtitleOffset - 0.5).toFixed(1)))} />
                <GlassPillButton label="0s" size="sm" onPress={() => engine.setSubtitleOffset(0)} />
                <GlassPillButton label="+0.5s" size="sm" onPress={() => engine.setSubtitleOffset(Number((engine.subtitleOffset + 0.5).toFixed(1)))} />
              </View>
            </View>

            <GlassPillButton
              label="Subtitles Off"
              size="sm"
              variant={!engine.activeTrack && !engine.nativeSubtitleId ? "primary" : "secondary"}
              onPress={() => {
                engine.pickNativeSubtitle(null);
                void engine.selectTrack(null);
                setSheet(null);
              }}
            />

            {engine.tracksLoading ? <ActivityIndicator color={palette.accent} /> : null}
            {engine.tracksError ? <Text style={styles.sheetError}>{engine.tracksError}</Text> : null}

            {(engine.tracks ?? []).map((t) => (
              <GlassPillButton
                key={t.id}
                label={t.languageName}
                size="sm"
                variant={engine.activeTrack?.id === t.id ? "primary" : "secondary"}
                onPress={() => {
                  engine.pickNativeSubtitle(null);
                  void engine.selectTrack(t);
                  setSheet(null);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {sheet === "quality" ? (
          <ScrollView contentContainerStyle={styles.sheetStack}>
            {engine.selectableList.map((src) => (
              <GlassPillButton
                key={src.url}
                label={`${src.resolution ?? src.format}${src.codec ? ` · ${src.codec.toUpperCase()}` : ""}`}
                size="sm"
                variant={engine.source?.url === src.url ? "primary" : "secondary"}
                onPress={() => {
                  engine.switchSource(src);
                  setSheet(null);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {sheet === "speed" ? (
          <View style={styles.speedRow}>
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((r) => (
              <GlassPillButton
                key={r}
                label={`${r}x`}
                size="sm"
                variant={Math.abs(engine.rate - r) < 0.05 ? "primary" : "secondary"}
                onPress={() => {
                  engine.setPlaybackRate(r);
                  setSheet(null);
                }}
              />
            ))}
          </View>
        ) : null}
      </MobilePickerSheet>
    </View>
  );
}

const CompactControlPill = memo(function CompactControlPill({
  icon,
  label,
  onPress,
}: {
  icon?: React.ReactNode;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.compactPill}>
      {icon}
      {label ? <Text style={styles.compactPillText}>{label}</Text> : null}
    </Pressable>
  );
});

const MobilePickerSheet = memo(function MobilePickerSheet({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <LiquidGlassView variant="dock" borderRadius={24} blurIntensity={48} style={styles.sheetCard} contentStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <GlassPillButton label="Done" size="sm" variant="secondary" onPress={onClose} />
          </View>
          <View style={{ maxHeight: 230 }}>{children}</View>
        </LiquidGlassView>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  subtitleWrap: {
    position: "absolute",
    left: 44,
    right: 44,
    alignItems: "center",
  },
  subtitleText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1.5 },
  },
  gestureAnchor: {
    position: "absolute",
    top: "44%",
  },
  gestureInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  gestureText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  topRightLockOnly: {
    position: "absolute",
  },
  nextWrap: {
    position: "absolute",
  },
  nextInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  nextText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  topFloatingRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backTitlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backLabel: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  topTitleText: {
    color: "#F2F6FC",
    fontSize: 13.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  bottomDockAnchor: {
    position: "absolute",
  },
  bottomDockInner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  scrubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 26,
  },
  timeText: {
    color: "#E8EEF7",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  compactPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 6, 11, 0.84)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorCard: {
    width: "100%",
    maxWidth: 420,
  },
  errorContent: {
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  errorBody: {
    color: palette.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 5, 10, 0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheetCard: {
    width: "100%",
    maxWidth: 480,
  },
  sheetContent: {
    padding: 18,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  sheetStack: {
    gap: 8,
  },
  sheetInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sheetSubLabel: {
    color: palette.textSecondary,
    fontSize: 12.5,
    fontWeight: "700",
  },
  sheetError: {
    color: palette.danger,
    fontSize: 12.5,
  },
  speedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
