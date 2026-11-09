import { Poster, initialsFor } from "@/components/ui/Poster";
import { lens, liftShadow } from "@/design-system/depth";
import { motion, springs } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette, gradients, radius as radTokens } from "@/design-system/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
  delay?: number;
  preferredFocus?: boolean;
  /** Opens the full collection in Explore. */
  onSeeAll?: () => void;
}

export function StageRail({
  label,
  entries,
  stage,
  delay = 0,
  preferredFocus = false,
  onSeeAll,
}: StageRailProps) {
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

  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View style={{ opacity: appear, transform: [{ translateY }], marginBottom: stage.rowGap }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: stage.gutter,
          marginBottom: stage.cardGap * 0.7,
        }}
      >
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            width: Math.max(3.5, stage.u * 0.7),
            height: stage.railTitleSize * 0.95,
            borderRadius: radTokens.pill,
            marginRight: stage.cardGap * 0.8,
          }}
        />
        <Text
          style={{
            color: palette.textPrimary,
            fontSize: stage.railTitleSize,
            fontWeight: "700",
            letterSpacing: -0.3,
          }}
        >
          {label}
        </Text>
        <View
          style={{
            backgroundColor: palette.glassFillStrong,
            borderColor: palette.glassStroke,
            borderWidth: StyleSheet.hairlineWidth,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radTokens.pill,
            marginLeft: stage.cardGap * 0.8,
          }}
        >
          <Text style={{ color: palette.textSecondary, fontSize: Math.max(10, stage.metaSize - 1), fontWeight: "700" }}>
            {entries.length}
          </Text>
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            style={{ marginLeft: "auto", paddingHorizontal: 6, paddingVertical: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`See all ${label}`}
          >
            <Text style={{ color: palette.accent, fontSize: stage.metaSize, fontWeight: "700" }}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: stage.gutter,
          paddingVertical: stage.cardGap * 1.2,
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

  const distance = useMemo(() => Animated.subtract(index, focusIndex), [index, focusIndex]);

  const rotateY = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: ["-14deg", "-5deg", "0deg", "5deg", "14deg"],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const scale = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: [0.88, 0.95, 1.04, 0.95, 0.88],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const lift = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, -1, 0, 1, 3],
        outputRange: [10, 3, -10, 3, 10],
        extrapolate: "clamp",
      }),
    [distance],
  );
  const closeness = useMemo(
    () => distance.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0], extrapolate: "clamp" }),
    [distance],
  );
  const bloomOpacity = useMemo(
    () => closeness.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
    [closeness],
  );
  const bloomScale = useMemo(
    () => closeness.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }),
    [closeness],
  );
  const hazeOpacity = useMemo(
    () =>
      distance.interpolate({
        inputRange: [-3, 0, 3],
        outputRange: [0.45, 0, 0.45],
        extrapolate: "clamp",
      }),
    [distance],
  );

  const press = useCallback(() => {
    play("tap");
    entry.onPress();
  }, [play, entry]);

  const focus = useCallback(() => onFocus(index), [index, onFocus]);
  const cardRadius = stage.focusRing * 5;

  return (
    <Animated.View
      renderToHardwareTextureAndroid={focused}
      style={[
        { width: stage.posterWidth, zIndex: focused ? 30 : 10 },
        focused ? liftShadow(3) : liftShadow(1),
        {
          transform:
            reduced || !engaged
              ? undefined
              : [{ perspective: lens }, { translateY: lift }, { rotateY }, { scale }],
        },
      ]}
    >
      {/* Dynamic kinetic bloom halo behind focused card */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bloom,
          {
            opacity: bloomOpacity,
            backgroundColor: palette.emberGlow,
            transform: [{ scale: bloomScale }],
            borderRadius: cardRadius + 4,
          },
        ]}
      />

      <Pressable
        onPress={press}
        onFocus={focus}
        onBlur={onBlur}
        hasTVPreferredFocus={preferredFocus}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}${entry.meta ? `, ${entry.meta}` : ""}`}
        style={{ borderRadius: cardRadius }}
      >
        <View
          style={{
            height: stage.posterHeight,
            borderRadius: cardRadius,
            overflow: "hidden",
            backgroundColor: palette.surface,
            borderColor: focused ? palette.accentBright : palette.glassStroke,
            borderWidth: focused ? Math.max(2, stage.focusRing) : StyleSheet.hairlineWidth,
          }}
        >
          <Poster uri={entry.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(entry.title)} />

          {/* Liquid glass specular top sheen */}
          <LinearGradient
            colors={gradients.glassSheen}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 0.7 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />

          {/* Atmospheric cinema haze for distant cards */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: palette.background, opacity: hazeOpacity, borderRadius: cardRadius },
            ]}
          />

          {/* Liquid Laser Progress groove */}
          {entry.progress !== null && entry.progress > 0 ? (
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={gradients.accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.min(100, Math.max(3, entry.progress))}%` }]}
              />
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          style={{
            color: palette.textPrimary,
            fontSize: stage.cardTitleSize,
            fontWeight: "600",
            marginTop: stage.cardGap * 0.5,
            paddingHorizontal: 2,
            letterSpacing: -0.2,
          }}
        >
          {entry.title}
        </Text>
        {entry.meta ? (
          <Text
            numberOfLines={1}
            style={{
              color: palette.textMuted,
              fontSize: stage.metaSize,
              marginTop: 1,
              paddingHorizontal: 2,
              fontWeight: "500",
            }}
          >
            {entry.meta}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bloom: {
    position: "absolute",
    top: -12,
    bottom: -12,
    left: -12,
    right: -12,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3.5,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  progressFill: {
    height: 3.5,
  },
});
