import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";

/**
 * Optical Liquid Glass Skeleton Primitives.
 * Uses a single native-driver opacity breath (or static crystal sheen on 2 GB RAM)
 * so loading screens look sculpted and luxurious without costing a single JS frame.
 */
function useSkeletonPulse(): Animated.Value | number {
  const profile = usePerformanceProfile();
  const pulse = useRef(new Animated.Value(0.62)).current;

  useEffect(() => {
    if (profile.isLowRam) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 920, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.56, duration: 920, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [profile.isLowRam, pulse]);

  return profile.isLowRam ? 0.78 : pulse;
}

export const GlassSkeletonBox = memo(function GlassSkeletonBox({
  width,
  height,
  borderRadius = radius.card,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSkeletonPulse();
  return (
    <Animated.View
      style={[
        styles.box,
        { width, height, borderRadius, opacity },
        style,
      ]}
    >
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.14)", "rgba(255, 255, 255, 0.04)", "rgba(18, 25, 38, 0.45)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

export const GlassMobileHomeSkeleton = memo(function GlassMobileHomeSkeleton({
  posterWidth,
}: {
  posterWidth: number;
}) {
  const posterHeight = Math.round((posterWidth * 3) / 2);
  return (
    <View style={styles.mobileWrap}>
      <GlassSkeletonBox width="100%" height={380} borderRadius={28} />
      {[0, 1].map((rail) => (
        <View key={rail} style={styles.railBlock}>
          <GlassSkeletonBox width={150} height={20} borderRadius={8} />
          <View style={styles.rowGap}>
            {[0, 1, 2].map((col) => (
              <GlassSkeletonBox
                key={col}
                width={posterWidth}
                height={posterHeight}
                borderRadius={radius.card}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});

export const GlassTvHomeSkeleton = memo(function GlassTvHomeSkeleton({
  posterWidth,
  leftInset,
}: {
  posterWidth: number;
  leftInset: number;
}) {
  const posterHeight = Math.round((posterWidth * 3) / 2);
  return (
    <View style={[styles.tvWrap, { paddingLeft: leftInset }]}>
      <GlassSkeletonBox width={130} height={26} borderRadius={8} />
      <View style={{ gap: 12, marginTop: 18, marginBottom: 24 }}>
        <View style={styles.rowGap}>
          <GlassSkeletonBox width={110} height={28} borderRadius={999} />
          <GlassSkeletonBox width={70} height={28} borderRadius={999} />
          <GlassSkeletonBox width={64} height={28} borderRadius={999} />
        </View>
        <GlassSkeletonBox width={420} height={46} borderRadius={12} />
        <GlassSkeletonBox width={480} height={38} borderRadius={10} />
        <View style={[styles.rowGap, { marginTop: 6 }]}>
          <GlassSkeletonBox width={168} height={48} borderRadius={999} />
          <GlassSkeletonBox width={150} height={48} borderRadius={999} />
          <GlassSkeletonBox width={182} height={48} borderRadius={999} />
        </View>
      </View>
      {[0, 1].map((rail) => (
        <View key={rail} style={styles.railBlock}>
          <GlassSkeletonBox width={180} height={22} borderRadius={8} />
          <View style={styles.rowGap}>
            {[0, 1, 2, 3, 4].map((col) => (
              <GlassSkeletonBox
                key={col}
                width={posterWidth}
                height={posterHeight}
                borderRadius={radius.card}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});

export const GlassPosterGridSkeleton = memo(function GlassPosterGridSkeleton({
  columns,
  posterWidth,
  rows = 2,
  horizontalPadding = 18,
}: {
  columns: number;
  posterWidth: number;
  rows?: number;
  horizontalPadding?: number;
}) {
  const posterHeight = Math.round((posterWidth * 3) / 2);
  return (
    <View style={{ paddingHorizontal: horizontalPadding, gap: 18 }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={styles.rowGap}>
          {Array.from({ length: columns }, (__, c) => (
            <GlassSkeletonBox
              key={c}
              width={posterWidth}
              height={posterHeight}
              borderRadius={radius.card}
            />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    backgroundColor: "rgba(18, 25, 38, 0.72)",
    borderColor: palette.glassStroke,
    borderWidth: 1,
    overflow: "hidden",
  },
  mobileWrap: {
    paddingHorizontal: 18,
    gap: 22,
  },
  tvWrap: {
    paddingTop: 24,
    paddingRight: 28,
    gap: 18,
  },
  railBlock: {
    gap: 12,
  },
  rowGap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
});
