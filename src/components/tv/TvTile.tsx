import { materials } from "@/design-system/materials";
import { motion } from "@/design-system/motion";
import { palette, radius, tvTypeScale } from "@/design-system/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Poster } from "@/components/ui/Poster";
import { cardScrim, chrome } from "@/design-system/gradients";

interface TvTileProps {
  title: string;
  posterUrl: string | null;
  initials: string;
  meta?: string | null;
  /** 0..1 watch progress drawn on the bottom edge. */
  progress?: number | null;
  onPress: () => void;
  width?: number;
  /** Give this tile initial focus when the row/screen appears. */
  hasPreferredFocus?: boolean;
  onFocus?: () => void;
}

/**
 * A television poster tile.
 *
 * Focus is the whole interaction on TV, so it gets real design attention: the
 * tile lifts (never more than 1.06), gains a cyan-edged blue ring, brightens its
 * caption and plays a quiet tick. Everything animates on the native driver.
 */
export const TvTile = memo(function TvTile({
  title,
  posterUrl,
  initials,
  meta,
  progress,
  onPress,
  width = 232,
  hasPreferredFocus,
  onFocus,
}: TvTileProps) {
  const lift = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const { play } = useSound();
  const height = Math.round((width * 3) / 2);

  const animateTo = useCallback(
    (value: number) => {
      if (reduced) return;
      Animated.timing(lift, { toValue: value, duration: motion.fast, useNativeDriver: true }).start();
    },
    [lift, reduced],
  );

  const handleFocus = useCallback(() => {
    animateTo(1);
    play("focus");
    onFocus?.();
  }, [animateTo, play, onFocus]);

  const handleBlur = useCallback(() => animateTo(0), [animateTo]);

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ringOpacity = lift;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasPreferredFocus}
      focusable
      accessibilityRole="button"
      accessibilityLabel={`${title}${meta ? `, ${meta}` : ""}`}
    >
      <Animated.View style={{ width, transform: [{ scale }] }}>
        <Poster uri={posterUrl} style={{ width, height }} initials={initials} fallbackLabel={title} />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius.md,
              borderWidth: 3,
              borderColor: palette.cyan,
              opacity: ringOpacity,
            },
          ]}
        />
        {progress != null && progress > 0 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.min(100, progress * 100)}%` }]} />
          </View>
        ) : null}
        <LinearGradient
          colors={cardScrim}
          style={styles.captionScrim}
          pointerEvents="none"
        />
        <View style={styles.caption}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** A focusable text/pill action for TV (Watch, Download, Delete…). */
export function TvButton({
  label,
  icon,
  onPress,
  variant = "secondary",
  hasPreferredFocus,
  onFocus,
  onBlur,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  hasPreferredFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const { play } = useSound();

  const bg =
    variant === "primary"
      ? palette.accent
      : variant === "danger"
        ? palette.dangerSoft
        : materials.secondary.fill;
  const border = variant === "primary" ? palette.accentBright : variant === "danger" ? palette.dangerEdge : materials.secondary.border;
  const fg = variant === "primary" ? palette.textOnAccent : variant === "danger" ? palette.danger : palette.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      focusable
      hasTVPreferredFocus={hasPreferredFocus}
      onFocus={() => {
        setFocused(true);
        play("focus");
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: focused ? palette.cyan : border,
          borderWidth: focused ? 3 : 1,
        },
      ]}
    >
      {icon}
      <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  progressTrack: { position: "absolute", bottom: 0, left: 0, right: 0, height: 5, backgroundColor: chrome.trackDim },
  progressBar: { height: 5, backgroundColor: palette.cyan },
  captionScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 84 },
  caption: { position: "absolute", left: 12, right: 12, bottom: 10, gap: 2 },
  title: { ...tvTypeScale.body, color: palette.textPrimary, fontWeight: "600" },
  meta: { ...tvTypeScale.caption, color: palette.textSecondary, fontSize: 14 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.pill,
    paddingHorizontal: 30,
    paddingVertical: 16,
    minHeight: 60,
  },
  btnLabel: { ...tvTypeScale.headline, fontWeight: "700" },
});
