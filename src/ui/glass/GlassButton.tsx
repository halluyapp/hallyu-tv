import React, { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { motion } from "@/design-system/motion";
import { palette, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import { GlassVariant, LiquidGlassView } from "./LiquidGlassView";

interface GlassPillButtonProps {
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "pearl" | "secondary" | "emerald";
  size?: "sm" | "md" | "lg" | "tv";
  active?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Tactile Liquid Glass capsule button for both Mobile touch and 10-foot TV remote.
 * On TV focus, smoothly illuminates into the luminous pearl-to-coral Liquid Glass
 * focus state shown across `tv-01`..`tv-05`.
 */
export const GlassPillButton = memo(function GlassPillButton({
  label,
  icon,
  variant = "secondary",
  size = "md",
  active = false,
  disabled = false,
  fullWidth = false,
  hasTVPreferredFocus = false,
  onPress,
  onFocus,
  onBlur,
  style,
  textStyle,
  accessibilityLabel,
}: GlassPillButtonProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { play } = useSound();

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: motion.instant,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    animateTo(1.04);
    play("tap", { intensity: 0.35 });
    onFocus?.();
  }, [animateTo, onFocus, play]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    animateTo(1);
    onBlur?.();
  }, [animateTo, onBlur]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onPress();
    play(variant === "primary" ? "confirm" : "tap");
  }, [disabled, onPress, play, variant]);

  const resolvedGlass: GlassVariant = focused
    ? variant === "primary"
      ? "ember"
      : "pearl"
    : active
      ? variant === "primary"
        ? "emberSolid"
        : "pearl"
      : variant === "primary"
        ? "emberSolid"
        : variant === "pearl"
          ? "pearl"
          : variant === "emerald"
            ? "emerald"
            : "card";

  const isLightSurface =
    resolvedGlass === "pearl" || (focused && variant !== "primary") || resolvedGlass === "ember";
  const textColor = isLightSurface
    ? palette.pearlInk
    : resolvedGlass === "emberSolid"
      ? "#FFFFFF"
      : resolvedGlass === "emerald"
        ? palette.gold
        : palette.textPrimary;

  const sizePreset = SIZE_PRESETS[size];

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.45 : 1 }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        focusable={!disabled}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        hasTVPreferredFocus={hasTVPreferredFocus}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPressIn={() => !focused && animateTo(0.97)}
        onPressOut={() => animateTo(focused ? 1.04 : 1)}
        onPress={handlePress}
      >
        <LiquidGlassView
          variant={resolvedGlass}
          borderRadius={radius.pill}
          focused={focused}
          contentStyle={[
            styles.row,
            {
              paddingHorizontal: sizePreset.px,
              paddingVertical: sizePreset.py,
              minHeight: sizePreset.minH,
            },
            fullWidth && styles.centerRow,
          ]}
        >
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              { fontSize: sizePreset.font, color: textColor },
              textStyle,
            ]}
          >
            {label}
          </Text>
        </LiquidGlassView>
      </Pressable>
    </Animated.View>
  );
});

interface GlassIconButtonProps {
  icon: ReactNode;
  accessibilityLabel: string;
  size?: number;
  active?: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const GlassIconButton = memo(function GlassIconButton({
  icon,
  accessibilityLabel,
  size = 44,
  active = false,
  hasTVPreferredFocus = false,
  onPress,
  onFocus,
  onBlur,
  style,
}: GlassIconButtonProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { play } = useSound();

  const animateTo = useCallback(
    (val: number) => {
      Animated.timing(scale, { toValue: val, duration: motion.instant, useNativeDriver: true }).start();
    },
    [scale],
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        focusable
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={() => {
          setFocused(true);
          animateTo(1.06);
          play("tap", { intensity: 0.35 });
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          animateTo(1);
          onBlur?.();
        }}
        onPressIn={() => !focused && animateTo(0.95)}
        onPressOut={() => animateTo(focused ? 1.06 : 1)}
        onPress={() => {
          play("tap");
          onPress();
        }}
      >
        <LiquidGlassView
          variant={focused || active ? "pearl" : "card"}
          borderRadius={size / 2}
          focused={focused}
          contentStyle={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </LiquidGlassView>
      </Pressable>
    </Animated.View>
  );
});

const SIZE_PRESETS = {
  sm: { px: 14, py: 7, minH: 34, font: 12.5 },
  md: { px: 18, py: 10, minH: 42, font: 14 },
  lg: { px: 24, py: 13, minH: 50, font: 15.5 },
  tv: { px: 24, py: 12, minH: 48, font: 15 },
} as const;

const styles = StyleSheet.create({
  fullWidth: { width: "100%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  centerRow: {
    width: "100%",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "700",
    letterSpacing: -0.1,
  },
});
