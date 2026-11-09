import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView } from "expo-video";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as RN from "react-native";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { motion } from "@/design-system/motion";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { usePlaybackEngine } from "@/services/player/usePlaybackEngine";
import { formatAudioTrackLabel } from "@/services/provider/originalAudio";
import { takePrefetched } from "@/services/provider/prefetch";
import { formatDuration } from "@/utils/format";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type Nav = NativeStackNavigationProp<TvStackParamList>;
type PlayerRoute = RouteProp<TvStackParamList, "TvPlayer">;

type TvSheetKind = "episodes" | "subtitles" | "audio" | "quality" | null;

/**
 * 1:1 Hallyu TV Full-Screen Cinema Player (`docs/ui-previews/tv-05-player.png`):
 * - Strictly ZERO top toolbar and ZERO center floating play/pause clutter!
 * - Hardware remote key listener active even when dock auto-hides:
 *     Select/OK/PlayPause -> toggles Play/Pause
 *     Left/Rewind -> skips -10s
 *     Right/FastForward -> skips +10s
 *     Up/Down/Menu -> reveals bottom Liquid Glass Cinema Dock (focus on Play/Pause)
 *     Back -> closes active modal first -> hides dock -> saves & exits cleanly
 * - Floating Translucent Liquid Glass Bottom Cinema Dock with D-pad interactive
 *   scrub bar + luminous pearl playhead + frosted glass pill row.
 */
export function TvPlayerScreen() {
  const route = useRoute<PlayerRoute>();
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const params = route.params;

  const navigateToEpisode = useCallback(
    (nextSeason: number, nextEp: number) => {
      const maxEp = params.maxEpisodesInSeason ?? 0;
      navigation.replace("TvPlayer", {
        ...params,
        season: nextSeason,
        episode: nextEp,
        resumeAt: 0,
        sources: takePrefetched(params.subjectId, params.detailPath, nextSeason, nextEp)?.sources ?? [],
        nextEpisode: maxEp === 0 || nextEp < maxEp ? { season: nextSeason, episode: nextEp + 1 } : null,
      });
    },
    [navigation, params],
  );

  const engine = usePlaybackEngine(params, navigateToEpisode);

  const [dockVisible, setDockVisible] = useState(true);
  const [activeSheet, setActiveSheet] = useState<TvSheetKind>(null);
  const [scrubFocused, setScrubFocused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dockOpacity = useRef(new Animated.Value(1)).current;
  const dockTranslateY = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockVisibleRef = useRef(dockVisible);
  dockVisibleRef.current = dockVisible;
  const sheetRef = useRef<TvSheetKind>(activeSheet);
  sheetRef.current = activeSheet;
  const scrubFocusedRef = useRef(scrubFocused);
  scrubFocusedRef.current = scrubFocused;

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 950);
  }, []);

  const hideDock = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Animated.parallel([
      Animated.timing(dockOpacity, { toValue: 0, duration: motion.fast, useNativeDriver: true }),
      Animated.timing(dockTranslateY, { toValue: 32, duration: motion.fast, useNativeDriver: true }),
    ]).start(() => setDockVisible(false));
  }, [dockOpacity, dockTranslateY]);

  const revealDock = useCallback(() => {
    setDockVisible(true);
    Animated.parallel([
      Animated.timing(dockOpacity, { toValue: 1, duration: motion.fast, useNativeDriver: true }),
      Animated.timing(dockTranslateY, { toValue: 0, duration: motion.fast, useNativeDriver: true }),
    ]).start();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (engine.isPlaying && sheetRef.current === null) {
        hideDock();
      }
    }, 4500);
  }, [dockOpacity, dockTranslateY, engine.isPlaying, hideDock]);

  useEffect(() => {
    revealDock();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [revealDock]);

  // Pause 4Hz scrubber React re-renders whenever the Liquid Glass dock is hidden!
  useEffect(() => {
    engine.setHudActive(dockVisible || activeSheet !== null);
  }, [activeSheet, dockVisible, engine.setHudActive]);

  // Reset auto-hide timer whenever Playing state changes
  useEffect(() => {
    if (dockVisible && engine.isPlaying && activeSheet === null) {
      revealDock();
    }
  }, [activeSheet, dockVisible, engine.isPlaying, revealDock]);

  // Hierarchical Back button discipline on Android TV
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sheetRef.current !== null) {
        setActiveSheet(null);
        revealDock();
        return true;
      }
      if (dockVisibleRef.current) {
        hideDock();
        return true;
      }
      engine.saveExitSnapshot();
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [engine, hideDock, navigation, revealDock]);

  // Hardware remote D-pad / media key handler (works when dock is hidden AND on scrub bar)
  useEffect(() => {
    const handleEventType = (eventType?: string) => {
      if (!eventType || sheetRef.current !== null) return;
      if (eventType === "playPause") {
        engine.togglePlay();
        flashToast(engine.isPlaying ? "Paused" : "Playing");
        return;
      }
      if (eventType === "play") {
        if (!engine.isPlaying) engine.togglePlay();
        flashToast("Playing");
        return;
      }
      if (eventType === "pause" || eventType === "stop") {
        if (engine.isPlaying) engine.togglePlay();
        flashToast("Paused");
        return;
      }
      if (eventType === "rewind" || eventType === "skipBackward") {
        engine.skipBy(-10);
        flashToast("−10s");
        return;
      }
      if (eventType === "fastForward" || eventType === "skipForward") {
        engine.skipBy(10);
        flashToast("+10s");
        return;
      }

      if (!dockVisibleRef.current) {
        if (eventType === "select") {
          engine.togglePlay();
          flashToast(engine.isPlaying ? "Paused" : "Playing");
        } else if (eventType === "left") {
          engine.skipBy(-10);
          flashToast("−10s");
        } else if (eventType === "right") {
          engine.skipBy(10);
          flashToast("+10s");
        } else if (eventType === "up" || eventType === "down" || eventType === "menu") {
          revealDock();
        }
        return;
      }

      // Dock IS visible: keep hide timer alive on remote navigation, and scrub when scrub bar focused
      revealDock();
      if (scrubFocusedRef.current) {
        if (eventType === "left") {
          engine.skipBy(-10);
        } else if (eventType === "right") {
          engine.skipBy(10);
        }
      }
    };

    const useTVEventHandler = (RN as unknown as { useTVEventHandler?: (cb: (ev: { eventType?: string }) => void) => void }).useTVEventHandler;
    void useTVEventHandler;

    const TVEventHandlerCtor = (RN as unknown as {
      TVEventHandler?: new () => { enable: (comp: unknown, cb: (_: unknown, ev: { eventType?: string }) => void) => void; disable: () => void };
    }).TVEventHandler;

    let tvHandler: { disable: () => void } | null = null;
    if (TVEventHandlerCtor) {
      try {
        const instance = new TVEventHandlerCtor();
        instance.enable(null, (_cmp, evt) => handleEventType(evt?.eventType));
        tvHandler = instance;
      } catch {}
    }

    const emitterSub = DeviceEventEmitter.addListener("onHWKeyEvent", (evt: { eventType?: string }) => {
      handleEventType(evt?.eventType);
    });

    return () => {
      tvHandler?.disable();
      emitterSub.remove();
    };
  }, [engine, flashToast, revealDock]);

  const progressRatio = engine.duration > 0 ? Math.min(1, Math.max(0, engine.position / engine.duration)) : 0;
  const bufferedRatio = engine.duration > 0 ? Math.min(1, Math.max(0, engine.bufferedPosition / engine.duration)) : 0;

  const headerLine = useMemo(() => {
    if (params.mediaType === "series" && !params.isTrailer) {
      return `${params.title.toUpperCase()}  ·  S${params.season} : E${params.episode}`;
    }
    return params.title.toUpperCase();
  }, [params.episode, params.isTrailer, params.mediaType, params.season, params.title]);

  const episodeNumbers = useMemo(() => {
    const count = Math.max(params.maxEpisodesInSeason ?? 0, params.episode);
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [params.episode, params.maxEpisodesInSeason]);

  const qualityBadge = engine.offline
    ? "Offline"
    : engine.source?.resolution
      ? engine.source.qualityValue && engine.source.qualityValue >= 720
        ? `${engine.source.resolution} HD`
        : engine.source.resolution
      : "Auto HD";

  return (
    <View style={styles.root}>
      {/* Full-Bleed Unobstructed 4K Cinema Viewport */}
      <VideoView
        player={engine.player}
        style={StyleSheet.absoluteFill}
        contentFit={engine.fitMode}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Invisible focus catcher when dock is hidden so Select/OK always toggles Play/Pause */}
      {!dockVisible && activeSheet === null && engine.status !== "error" ? (
        <Pressable
          focusable
          accessible
          accessibilityLabel="Toggle playback or reveal controls"
          hasTVPreferredFocus
          onPress={() => {
            engine.togglePlay();
            revealDock();
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Clean Cinema Subtitles */}
      {engine.activeTrack && engine.currentCue ? (
        <View
          pointerEvents="none"
          style={[
            styles.subtitleWrap,
            { bottom: dockVisible ? 156 : 44 },
          ]}
        >
          <Text style={[styles.subtitleText, { fontSize: Math.round(stage.subtitleSize * engine.subtitleScale) }]}>
            {engine.currentCue.text}
          </Text>
        </View>
      ) : null}

      {/* Subtle Translucent Liquid Glass Remote Feedback Toast */}
      {toast || engine.audioSwitchToast ? (
        <View pointerEvents="none" style={styles.toastAnchor}>
          <LiquidGlassView variant="dock" borderRadius={radius.pill} contentStyle={styles.toastInner}>
            <Text style={styles.toastText}>{engine.audioSwitchToast ?? toast}</Text>
          </LiquidGlassView>
        </View>
      ) : null}

      {/* Subtle Buffering Indicator (only during network buffer, never during normal pause!) */}
      {(engine.status === "loading" || (engine.buffering && engine.status === "ready")) ? (
        <View pointerEvents="none" style={styles.bufferBadge}>
          <LiquidGlassView variant="dock" borderRadius={radius.pill} contentStyle={styles.bufferInner}>
            <ActivityIndicator size="small" color={palette.accentBright} />
            <Text style={styles.bufferText}>
              {engine.offline
                ? "Opening offline file…"
                : engine.stallSeconds >= 5
                  ? "Refreshing stream…"
                  : "Loading HD stream…"}
            </Text>
          </LiquidGlassView>
        </View>
      ) : null}

      {/* Next Episode Auto-Play Liquid Glass Capsule */}
      {engine.nextCountdown !== null && params.nextEpisode && engine.status !== "error" ? (
        <View style={[styles.nextWrap, { bottom: dockVisible ? 168 : 38 }]}>
          <LiquidGlassView variant="dock" borderRadius={22} contentStyle={styles.nextInner}>
            <View>
              <Text style={styles.nextMicro}>Up Next</Text>
              <Text style={styles.nextLabel}>
                S{params.nextEpisode.season} · E{params.nextEpisode.episode} in {engine.nextCountdown}s
              </Text>
            </View>
            <GlassPillButton
              label="Play Now"
              variant="primary"
              size="sm"
              onPress={() => {
                engine.saveExitSnapshot();
                navigateToEpisode(params.nextEpisode!.season, params.nextEpisode!.episode);
              }}
            />
            <GlassPillButton
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={engine.cancelAutoNext}
            />
          </LiquidGlassView>
        </View>
      ) : null}

      {/* Playback Error Recovery Modal */}
      {engine.status === "error" ? (
        <View style={styles.errorBackdrop}>
          <LiquidGlassView variant="dock" borderRadius={28} style={styles.errorCard} contentStyle={styles.errorContent}>
            <Text style={styles.errorTitle}>Stream Interrupted</Text>
            <Text style={styles.errorMessage}>
              {engine.failMessage ?? "This stream could not be opened right now."}
            </Text>
            <View style={styles.errorActions}>
              <GlassPillButton label="Retry Fresh Stream" variant="primary" size="tv" hasTVPreferredFocus onPress={engine.retry} />
              <GlassPillButton
                label="Back to Details"
                variant="secondary"
                size="tv"
                onPress={() => {
                  engine.saveExitSnapshot();
                  navigation.goBack();
                }}
              />
            </View>
          </LiquidGlassView>
        </View>
      ) : null}

      {/* 1:1 Floating Translucent Liquid Glass Bottom Cinema Dock (`tv-05-player.png`) */}
      {dockVisible && engine.status !== "error" ? (
        <Animated.View
          style={[
            styles.dockAnchor,
            {
              opacity: dockOpacity,
              transform: [{ translateY: dockTranslateY }],
            },
          ]}
        >
          <LiquidGlassView
            variant="dock"
            borderRadius={28}
            blurIntensity={46}
            contentStyle={styles.dockInner}
          >
            {/* Row 1: Title + Episode on left, Timecode on right */}
            <View style={styles.dockHeaderRow}>
              <Text numberOfLines={1} style={styles.dockTitle}>
                {headerLine}
              </Text>
              <Text style={styles.dockTimecode}>
                {formatDuration(engine.position)} / {formatDuration(engine.duration)}
              </Text>
            </View>

            {/* Row 2: D-Pad Focusable Liquid Glass Scrub Bar with Luminous Pearl Playhead */}
            <Pressable
              focusable
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Timeline scrub bar. Use left and right on remote to seek."
              onFocus={() => {
                setScrubFocused(true);
                revealDock();
              }}
              onBlur={() => setScrubFocused(false)}
              onPress={() => {
                engine.togglePlay();
                revealDock();
              }}
              style={[styles.scrubHitArea, scrubFocused && styles.scrubHitFocused]}
            >
              <View style={styles.scrubTrack}>
                <View style={[styles.scrubBuffered, { width: `${Math.round(bufferedRatio * 100)}%` }]} />
                <LinearGradient
                  colors={["#FFFFFF", "#FFE5D6"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.scrubFill, { width: `${Math.round(progressRatio * 100)}%` }]}
                />
              </View>
              <View
                style={[
                  styles.playhead,
                  { left: `${Math.round(progressRatio * 100)}%` },
                  scrubFocused && styles.playheadFocused,
                ]}
              />
            </Pressable>

            {/* Row 3: Single Clean Tactile Liquid Glass Control Pill Row */}
            <View style={styles.controlsRow}>
              <GlassPillButton
                label={engine.isPlaying ? "Pause" : "Play"}
                variant="pearl"
                size="md"
                hasTVPreferredFocus
                onFocus={revealDock}
                onPress={() => {
                  engine.togglePlay();
                  revealDock();
                }}
              />
              <GlassPillButton
                label="-10s"
                variant="secondary"
                size="md"
                onFocus={revealDock}
                onPress={() => {
                  engine.skipBy(-10);
                  revealDock();
                }}
              />
              <GlassPillButton
                label="+10s"
                variant="secondary"
                size="md"
                onFocus={revealDock}
                onPress={() => {
                  engine.skipBy(10);
                  revealDock();
                }}
              />
              {params.nextEpisode && !params.isTrailer ? (
                <GlassPillButton
                  label="Next Ep"
                  variant="secondary"
                  size="md"
                  onFocus={revealDock}
                  onPress={() => {
                    engine.saveExitSnapshot();
                    navigateToEpisode(params.nextEpisode!.season, params.nextEpisode!.episode);
                  }}
                />
              ) : null}
              {params.mediaType === "series" && !params.isTrailer && episodeNumbers.length > 1 ? (
                <GlassPillButton
                  label="Episodes"
                  variant="secondary"
                  size="md"
                  onFocus={revealDock}
                  onPress={() => setActiveSheet("episodes")}
                />
              ) : null}
              {!params.isTrailer ? (
                <GlassPillButton
                  label={engine.activeTrack ? `Subtitles · ${engine.activeTrack.languageName}` : "Subtitles"}
                  variant="secondary"
                  size="md"
                  onFocus={revealDock}
                  onPress={() => {
                    void engine.loadCaptions();
                    engine.refreshNativeTracks();
                    setActiveSheet("subtitles");
                  }}
                />
              ) : null}
              {!params.isTrailer && (!engine.offline || engine.nativeAudioTracks.length > 1) ? (
                <GlassPillButton
                  label="Audio"
                  variant="secondary"
                  size="md"
                  onFocus={revealDock}
                  onPress={() => {
                    engine.refreshNativeTracks();
                    void engine.loadAudioVersions();
                    setActiveSheet("audio");
                  }}
                />
              ) : null}
              {!engine.offline && !params.isTrailer ? (
                <GlassPillButton
                  label={qualityBadge}
                  variant="secondary"
                  size="md"
                  onFocus={revealDock}
                  onPress={() => setActiveSheet("quality")}
                />
              ) : null}
              <GlassPillButton
                label={engine.fitMode === "contain" ? "Fit" : "Zoom"}
                variant="secondary"
                size="md"
                onFocus={revealDock}
                onPress={() => {
                  engine.setFitMode(engine.fitMode === "contain" ? "cover" : "contain");
                  revealDock();
                }}
              />
            </View>
          </LiquidGlassView>
        </Animated.View>
      ) : null}

      {/* 10-Foot Focus-Safe Liquid Glass Picker Modals */}
      <TvPickerModal
        visible={activeSheet !== null}
        title={
          activeSheet === "episodes"
            ? `Season ${params.season} · Episodes`
            : activeSheet === "subtitles"
              ? "Subtitles & Timing"
              : activeSheet === "audio"
                ? "Audio Tracks"
                : "Stream Quality"
        }
        onClose={() => {
          setActiveSheet(null);
          revealDock();
        }}
      >
        {activeSheet === "episodes" ? (
          <FlatList
            data={episodeNumbers}
            numColumns={4}
            keyExtractor={(ep) => `ep-${ep}`}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item: epNum }) => (
              <GlassPillButton
                label={`Episode ${epNum}`}
                variant={epNum === params.episode ? "primary" : "secondary"}
                active={epNum === params.episode}
                hasTVPreferredFocus={epNum === params.episode}
                onPress={() => {
                  setActiveSheet(null);
                  if (epNum !== params.episode) {
                    engine.saveExitSnapshot();
                    navigateToEpisode(params.season, epNum);
                  }
                }}
                style={{ flex: 1 }}
              />
            )}
          />
        ) : null}

        {activeSheet === "subtitles" ? (
          <ScrollView contentContainerStyle={styles.sheetStack}>
            <View style={styles.sheetControlRow}>
              <Text style={styles.sheetRowTitle}>Timing Offset ({engine.subtitleOffset >= 0 ? `+${engine.subtitleOffset.toFixed(1)}s` : `${engine.subtitleOffset.toFixed(1)}s`})</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <GlassPillButton label="-0.5s" size="sm" onPress={() => engine.setSubtitleOffset(Number((engine.subtitleOffset - 0.5).toFixed(1)))} />
                <GlassPillButton label="Reset" size="sm" onPress={() => engine.setSubtitleOffset(0)} />
                <GlassPillButton label="+0.5s" size="sm" onPress={() => engine.setSubtitleOffset(Number((engine.subtitleOffset + 0.5).toFixed(1)))} />
              </View>
            </View>

            <View style={styles.sheetControlRow}>
              <Text style={styles.sheetRowTitle}>Caption Size</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { s: 0.85, l: "Small" },
                  { s: 1, l: "Normal" },
                  { s: 1.2, l: "Large" },
                  { s: 1.4, l: "XL" },
                ].map((opt) => (
                  <GlassPillButton
                    key={opt.l}
                    label={opt.l}
                    size="sm"
                    variant={Math.abs(engine.subtitleScale - opt.s) < 0.05 ? "pearl" : "secondary"}
                    active={Math.abs(engine.subtitleScale - opt.s) < 0.05}
                    onPress={() => engine.setSubtitleScale(opt.s)}
                  />
                ))}
              </View>
            </View>

            <GlassPillButton
              label="Subtitles Off"
              variant={!engine.activeTrack && !engine.nativeSubtitleId ? "primary" : "secondary"}
              hasTVPreferredFocus={!engine.activeTrack}
              onPress={() => {
                engine.pickNativeSubtitle(null);
                void engine.selectTrack(null);
                setActiveSheet(null);
              }}
            />

            {engine.tracksLoading ? <ActivityIndicator color={palette.accent} /> : null}
            {engine.tracksError ? <Text style={styles.sheetError}>{engine.tracksError}</Text> : null}

            {(engine.tracks ?? []).map((track) => (
              <GlassPillButton
                key={track.id}
                label={track.languageName}
                variant={engine.activeTrack?.id === track.id ? "primary" : "secondary"}
                hasTVPreferredFocus={engine.activeTrack?.id === track.id}
                onPress={() => {
                  engine.pickNativeSubtitle(null);
                  void engine.selectTrack(track);
                  setActiveSheet(null);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {activeSheet === "audio" ? (
          <ScrollView contentContainerStyle={styles.sheetStack}>
            {!engine.offline ? (
              <>
                <Text style={styles.sheetRowTitle}>Stream Audio Version</Text>
                {engine.audioVersionsLoading && engine.audioVersions.length <= 1 ? (
                  <View style={{ paddingVertical: 10, alignItems: "center", gap: 8 }}>
                    <ActivityIndicator color={palette.accent} />
                    <Text style={styles.sheetRowTitle}>Finding Original Audio & language versions…</Text>
                  </View>
                ) : null}
                {engine.audioVersions.map((ver, idx) => {
                  const active = ver.subjectId === engine.activeSubjectId;
                  return (
                    <GlassPillButton
                      key={ver.subjectId}
                      label={ver.label}
                      variant={active ? "primary" : ver.isOriginal ? "pearl" : "secondary"}
                      active={active}
                      hasTVPreferredFocus={active || idx === 0}
                      onPress={() => {
                        setActiveSheet(null);
                        void engine.switchAudioVersion(ver);
                      }}
                    />
                  );
                })}
              </>
            ) : null}

            {engine.nativeAudioTracks.length > 1 ? (
              <>
                <Text style={[styles.sheetRowTitle, { marginTop: 8 }]}>Container Audio Tracks</Text>
                {engine.nativeAudioTracks.map((track, idx) => (
                  <GlassPillButton
                    key={track.id}
                    label={formatAudioTrackLabel(track, idx, engine.country)}
                    variant={engine.nativeAudioId === track.id ? "primary" : "secondary"}
                    hasTVPreferredFocus={
                      engine.audioVersions.length === 0 && (engine.nativeAudioId === track.id || idx === 0)
                    }
                    onPress={() => {
                      engine.pickNativeAudio(track);
                      setActiveSheet(null);
                    }}
                  />
                ))}
              </>
            ) : null}

            {!engine.audioVersionsLoading &&
            engine.audioVersions.length <= 1 &&
            engine.nativeAudioTracks.length <= 1 ? (
              <Text style={styles.sheetRowTitle}>
                Playing the primary Original Audio stream available from the provider.
              </Text>
            ) : null}
          </ScrollView>
        ) : null}

        {activeSheet === "quality" ? (
          <ScrollView contentContainerStyle={styles.sheetStack}>
            {engine.selectableList.map((src, idx) => {
              const active = engine.source?.url === src.url;
              const label = `${src.resolution ?? src.format}${src.codec ? ` · ${src.codec.toUpperCase()}` : ""}`;
              return (
                <GlassPillButton
                  key={src.url}
                  label={label}
                  variant={active ? "primary" : "secondary"}
                  hasTVPreferredFocus={active || idx === 0}
                  onPress={() => {
                    engine.switchSource(src);
                    setActiveSheet(null);
                  }}
                />
              );
            })}
          </ScrollView>
        ) : null}
      </TvPickerModal>
    </View>
  );
}

const TvPickerModal = memo(function TvPickerModal({
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
      <View style={styles.modalBackdrop}>
        <LiquidGlassView variant="dock" borderRadius={28} blurIntensity={48} style={styles.modalCard} contentStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <GlassPillButton label="Close" size="sm" variant="secondary" onPress={onClose} />
          </View>
          <View style={{ maxHeight: 340 }}>{children}</View>
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
    left: 72,
    right: 72,
    alignItems: "center",
  },
  subtitleText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  toastAnchor: {
    position: "absolute",
    top: 32,
    right: 42,
  },
  toastInner: {
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  bufferBadge: {
    position: "absolute",
    top: 32,
    alignSelf: "center",
  },
  bufferInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  bufferText: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  nextWrap: {
    position: "absolute",
    right: 52,
  },
  nextInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  nextMicro: {
    color: palette.textMuted,
    fontSize: 10.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  nextLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  dockAnchor: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 24,
  },
  dockInner: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  dockHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  dockTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  dockTimecode: {
    color: "#E8EEF7",
    fontSize: 14.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  scrubHitArea: {
    height: 22,
    justifyContent: "center",
    position: "relative",
    borderRadius: 11,
    paddingHorizontal: 2,
  },
  scrubHitFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  scrubTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    overflow: "hidden",
  },
  scrubBuffered: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.30)",
  },
  scrubFill: {
    height: "100%",
    borderRadius: 3,
  },
  playhead: {
    position: "absolute",
    width: 15,
    height: 15,
    marginLeft: -7.5,
    borderRadius: 7.5,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFF4EC",
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 6,
  },
  playheadFocused: {
    width: 19,
    height: 19,
    marginLeft: -9.5,
    borderRadius: 9.5,
    borderWidth: 2.5,
    borderColor: palette.accent,
  },
  controlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  errorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 6, 11, 0.84)",
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
  },
  errorCard: {
    width: "100%",
    maxWidth: 520,
  },
  errorContent: {
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  errorMessage: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 5, 10, 0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
  },
  modalContent: {
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  sheetStack: {
    gap: 10,
  },
  sheetControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  sheetRowTitle: {
    color: palette.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  sheetError: {
    color: palette.danger,
    fontSize: 13,
  },
});
