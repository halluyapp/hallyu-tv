import { Poster, initialsFor } from "@/components/ui/Poster";
import { glass, lens, liftShadow } from "@/design-system/depth";
import { motion, springs } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * StageRail — a physical shelf.
 *
 * Depth is produced by six cues, all on the native driver:
 *   1. perspective convergence (rotateY away from the focus point)
 *   2. relative scale (neighbours recede)
 *   3. vertical lift (the focused card rises off the shelf)
 *   4. atmospheric haze (distant cards sink into the room)
 *   5. ember spill (light thrown behind the focused card)
 *   6. occlusion (zIndex + contact shadow)
 *
 * The critical engineering choice: a single Animated.Value holds the focused
 * index and every card interpolates from its own distance to it. Focus changes
 * do not re-render per frame, and transforms never move layout boxes — so the
 * d-pad can never chase a card that is mid-animation.
 */

export interface RailEntry {
  key: string;
  posterUrl: string | null;
  title: string;
  meta: string | null;
  /** 0–100, or null when there is no progress to show. */
  progress: number | null;
  onPress: () => void;
}

interface StageRailProps {
  label: string;
  entries: RailEntry[];
  stage: Stage;
  /** Entrance delay for row choreography (ms). */
  delay?: number;
  /** Give the first card remote focus when the screen opens. */
  preferredFocus?: boolean;
}

export function StageRail({ label, entries, stage, delay = 0, preferredFocus = false }: StageRailProps) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState<number | null>(null);
  const focusIndex = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);
  const pitch = stage.posterWidth + stage.cardGap;

  useEffect(() => {
    if (reduced) {
      appear.setValue(1);
      return;
    }
    const anim = Animated.timing(appear, {
      toValue: 1,
      duration: motion.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [appear, delay, reduced]);

  const handleFocus = useCallback(
    (index: number) => {
      setFocused(index);
      Animated.spring(focusIndex, { toValue: index, useNativeDriver: true, ...springs.focus }).start();
      scrollRef.current?.scrollTo({ x: Math.max(0, index * pitch - stage.gutter), animated: true });
    },
    [focusIndex, pitch, stage.gutter],
  );

  const handleBlur = useCallback(() => setFocused(null), []);

  if (entries.length === 0) return null;

  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });

  return (
    <Animated.View style={{ opacity: appear, transform: [{ translateY }], marginBottom: stage.rowGap }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: stage.gutter,
          marginBottom: stage.cardGap * 0.8,
        }}
      >
        <View
          style={{
            width: Math.max(3, stage.u * 0.6),
            height: stage.railTitleSize * 0.9,
            borderRadius: 2,
            backgroundColor: palette.accent,
            marginRight: stage.cardGap * 0.8,
          }}
        />
        <Text style={{ color: palette.textPrimary, fontSize: stage.railTitleSize, fontWeight: "700", letterSpacing: -0.2 }}>
          {label}
        </Text>
        <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, marginLeft: stage.cardGap }}>{entries.length}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: stage.gutter,
          paddingVertical: stage.cardGap * 1.4,
          gap: stage.cardGap,
        }}
      >
        {entries.map((entry, index) => (
          <StageTile
            key={entry.key}
            entry={entry}
            index={index}
            focusIndex={focusIndex}
            focused={focused === index}
            engaged={focused !== null}
            stage={stage}
            preferredFocus={preferredFocus && index === 0}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

interface StageTileProps {
  entry: RailEntry;
  index: number;
  focusIndex: Animated.Value;
  focused: boolean;
  engaged: boolean;
  stage: Stage;
  preferredFocus: boolean;
  onFocus: (index: number) => void;
  onBlur: () => void;
}

const StageTile = memo(function StageTile({
  entry,
  index,
  focusIndex,
  focused,
  engaged,
  stage,
  preferredFocus,
  onFocus,
  onBlur,
}: StageTileProps) {
  const reduced = useReducedMotion();
  const { play } = useSound();

  // Animated distance from the focus point (negative = left of focus).
  const distance = useMemo(() => Animated.subtract(index, focusIndex), [index, focusIndex]);

  const rotateY = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: ["-13deg", "-4deg", "0deg", "4deg", "13deg"],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const scale = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: [0.86, 0.94, 1, 0.94, 0.86],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const lift = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: [12, 4, -9, 4, 12],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const closeness = useMemo(
    () => distance.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0], extrapolate: "clamp" }),
    [distance],
  );
  const rimOpacity = useMemo(
    () => closeness.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }),
    [closeness],
  );
  const bloomOpacity = useMemo(
    () => closeness.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    [closeness],
  );
  const bloomScale = useMemo(
    () => closeness.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.1] }),
    [closeness],
  );
  const hazeOpacity = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, 0, 3],
        outputRange: [0.46, 0, 0.46],
        extrapolate: "clamp",
      }),
    [distance],
  );

  const press = useCallback(() => {
    play("tap");
    entry.onPress();
  }, [play, entry]);

  const focus = useCallback(() => onFocus(index), [index, onFocus]);

  const radius = stage.focusRing * 5;

  return (
    <Animated.View
      renderToHardwareTextureAndroid={focused}
      style={[
        { width: stage.posterWidth, zIndex: focused ? 30 : 10 },
        focused ? styles.focusedSlot : null,
        {
          transform:
            reduced || !engaged
              ? undefined
              : [{ perspective: lens }, { translateY: lift }, { rotateY }, { scale }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bloom,
          { opacity: bloomOpacity, backgroundColor: glass.ember, transform: [{ scale: bloomScale }], borderRadius: radius },
        ]}
      />

      <Pressable
        onPress={press}
        onFocus={focus}
        onBlur={onBlur}
        hasTVPreferredFocus={preferredFocus}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}${entry.meta ? `, ${entry.meta}` : ""}`}
        style={{ borderRadius: radius }}
      >
        <View style={{ height: stage.posterHeight, borderRadius: radius, overflow: "hidden", backgroundColor: palette.surface }}>
          <Poster uri={entry.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(entry.title)} />
          <LinearGradient
            colors={glass.sheen}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.65, y: 0.85 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: glass.haze, opacity: hazeOpacity, borderRadius: radius },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: radius, borderWidth: stage.focusRing, borderColor: glass.rimLit, opacity: rimOpacity },
            ]}
          />
          {entry.progress !== null && entry.progress > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(2, entry.progress))}%` }]} />
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          style={{
            color: palette.textPrimary,
            fontSize: stage.cardTitleSize,
            fontWeight: "600",
            marginTop: stage.cardGap * 0.6,
            paddingHorizontal: 2,
          }}
        >
          {entry.title}
        </Text>
        {entry.meta ? (
          <Text
            numberOfLines={1}
            style={{ color: palette.textMuted, fontSize: stage.metaSize, marginTop: 1, paddingHorizontal: 2 }}
          >
            {entry.meta}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  focusedSlot: liftShadow(2),
  bloom: {
    position: "absolute",
    top: -10,
    bottom: -10,
    left: -10,
    right: -10,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(244,242,237,0.22)",
  },
  progressFill: { height: 3, backgroundColor: palette.accent },
});
