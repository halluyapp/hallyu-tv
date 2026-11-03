import { palette, radius, typeScale } from "@/design-system/tokens";
import React, { useCallback, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

type Variant = "primary" | "secondary" | "quiet" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: palette.accent, fg: "#1A0E0A" },
  secondary: { bg: palette.glassFillStrong, fg: palette.textPrimary, border: palette.glassStroke },
  quiet: { bg: "transparent", fg: palette.textSecondary },
  danger: { bg: "rgba(224,107,112,0.14)", fg: palette.danger, border: "rgba(224,107,112,0.35)" },
};

export function Button({ label, onPress, variant = "primary", icon, loading, disabled, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.965, useNativeDriver: true, speed: 40 }).start();
    if (!isDisabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [scale, isDisabled]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  }, [scale]);

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: isDisabled ? 0.55 : 1 }, style]}>
      <Pressable onPress={onPress} disabled={isDisabled} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={[styles.base, { backgroundColor: v.bg, borderColor: v.border ?? "transparent" }]}>
          {loading ? (
            <ActivityIndicator color={v.fg} size="small" />
          ) : (
            <>
              {icon}
              <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
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
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 15,
    paddingHorizontal: 22,
  },
  label: {
    ...typeScale.headline,
    color: "inherit",
  },
});
