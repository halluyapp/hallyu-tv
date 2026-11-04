import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { CloudOff, RefreshCw } from "lucide-react-native";
import { Button } from "./Button";

/** Skeleton shimmer block for catalogue loading. Static when motion is reduced. */
export function Skeleton({ width, height, style }: { width: number | `${number}%`; height: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const afford = canAffordAmbience();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || !afford) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, afford, shimmer]);

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-1, 1] });

  return (
    <View style={[{ width, height, borderRadius: radius.md, backgroundColor: palette.surfaceRaised, overflow: "hidden" }, style]}>
      {!reduced && afford ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.glassFill,
              transform: [{ translateX: Animated.multiply(translateX, width === "100%" ? 300 : (typeof width === "number" ? width : 300)) }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export function SkeletonRail({ itemWidth = 110, count = 4 }: { itemWidth?: number; count?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <Skeleton width={itemWidth} height={Math.round((itemWidth * 3) / 2)} />
          <Skeleton width={itemWidth * 0.7} height={10} style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <Text style={[typeScale.headline, styles.title]}>{title}</Text>
      <Text style={[typeScale.caption, styles.message]}>{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <CloudOff size={28} color={palette.textMuted} />
      <Text style={[typeScale.headline, styles.title]}>Something went wrong</Text>
      <Text style={[typeScale.caption, styles.message]}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" icon={<RefreshCw size={16} color={palette.textPrimary} />} onPress={onRetry} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  title: { color: palette.textPrimary, textAlign: "center" },
  message: { color: palette.textSecondary, textAlign: "center", lineHeight: 19 },

});
