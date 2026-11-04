import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { CloudOff, RefreshCw, Film } from "lucide-react-native";
import { Button } from "./Button";
import { LinearGradient } from "expo-linear-gradient";

/** Liquid Glass Skeleton shimmer block with fluid specular sweep. */
export function Skeleton({
  width,
  height,
  style,
  borderRadius = radius.md,
}: {
  width: number | `${number}%`;
  height: number;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}) {
  const reduced = useReducedMotion();
  const afford = canAffordAmbience();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || !afford) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, afford, shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: palette.surfaceRaised,
          overflow: "hidden",
          borderColor: palette.glassStroke,
          borderWidth: StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {!reduced && afford ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255, 255, 255, 0.08)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SkeletonRail({ itemWidth = 110, count = 4 }: { itemWidth?: number; count?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginVertical: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <Skeleton width={itemWidth} height={Math.round((itemWidth * 3) / 2)} borderRadius={radius.card} />
          <Skeleton width={itemWidth * 0.8} height={12} style={{ marginTop: spacing.sm }} />
          <Skeleton width={itemWidth * 0.5} height={10} style={{ marginTop: spacing.xs }} />
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.cardContainer}>
      <View style={styles.glassCard}>
        <View style={styles.iconOrb}>
          {icon ?? <Film size={32} color={palette.accent} />}
        </View>
        <Text style={[typeScale.headline, styles.title]}>{title}</Text>
        <Text style={[typeScale.body, styles.message]}>{message}</Text>
      </View>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.cardContainer}>
      <View style={styles.glassCard}>
        <View style={[styles.iconOrb, { backgroundColor: palette.dangerSoft }]}>
          <CloudOff size={32} color={palette.danger} />
        </View>
        <Text style={[typeScale.headline, styles.title]}>Connection Interrupted</Text>
        <Text style={[typeScale.body, styles.message]}>{message}</Text>
        {onRetry ? (
          <Button
            label="Try again"
            variant="secondary"
            icon={<RefreshCw size={16} color={palette.textPrimary} />}
            onPress={onRetry}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  glassCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sheet,
    padding: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  iconOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeHighlight,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    color: palette.textPrimary,
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  message: {
    color: palette.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    fontSize: 14,
  },
});
