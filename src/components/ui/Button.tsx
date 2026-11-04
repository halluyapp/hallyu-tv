import { materials } from "@/design-system/materials";
import { motion } from "@/design-system/motion";
import { palette, radius, hitTarget, typeScale } from "@/design-system/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import React, { useCallback, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

type Variant = "primary" | "secondary" | "quiet" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Stretch to the container width (forms, sheets). */
  block?: boolean;
}

/**
 * The single button primitive. Colours come from tokens + materials only, the
 * press scale respects reduced motion, and the minimum height is the documented
 * touch target rather than whatever padding happened to produce it.
 */
export function Button({ label, onPress, variant = "primary", icon, loading, disabled, style, block }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { play } = useSound();
  const reduced = useReducedMotion();
  const isDisabled = Boolean(disabled) || Boolean(loading);

  const onPressIn = useCallback(() => {
    if (!reduced) Animated.timing(scale, { toValue: 0.97, duration: motion.instant, useNativeDriver: true }).start();
    if (!isDisabled) play("tap");
  }, [scale, reduced, isDisabled, play]);

  const onPressOut = useCallback(() => {
    if (!reduced) Animated.timing(scale, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
  }, [scale, reduced]);

  const look =
    variant === "primary"
      ? { bg: palette.accent, fg: palette.textOnAccent, border: palette.accentBright }
      : variant === "danger"
        ? { bg: palette.dangerSoft, fg: palette.danger, border: palette.dangerEdge }
        : variant === "quiet"
          ? { bg: "transparent", fg: palette.textSecondary, border: "transparent" }
          : { bg: materials.secondary.fill, fg: palette.textPrimary, border: materials.secondary.border };

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: isDisabled ? 0.55 : 1 }, block ? { alignSelf: "stretch" } : null, style]}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      >
        <View style={[styles.base, { backgroundColor: look.bg, borderColor: look.border }]}>
          {loading ? (
            <ActivityIndicator color={look.fg} size="small" />
          ) : (
            <>
              {icon}
              <Text style={[styles.label, { color: look.fg }]}>{label}</Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 22,
    minHeight: hitTarget.mobile,
  },
  label: { ...typeScale.headline },
});
