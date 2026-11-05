import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { BRAND_SHORT_NAME, APP_TAGLINE } from "@/config/branding";
import { gradients, palette, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";

/** Optical Liquid Glass Splash — pearl crystal capsule + sunset coral-ember core. */
export function EmberSplash() {
  const profile = usePerformanceProfile();
  const pulse = useRef(new Animated.Value(0.86)).current;

  useEffect(() => {
    if (profile.isLowRam) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.86,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [profile.isLowRam, pulse]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.glowOrb, { opacity: pulse }]} />
      <Animated.View style={[styles.glassOrb, { transform: [{ scale: pulse }] }]}>
        <LinearGradient
          colors={gradients.glassSheen}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 0.9 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={gradients.emberCapsule}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.innerFlame}
        />
      </Animated.View>
      <View style={styles.textContainer}>
        <View style={styles.brandRow}>
          <Text style={styles.wordmark}>{BRAND_SHORT_NAME}</Text>
          <View style={styles.brandDot} />
        </View>
        <Text style={styles.tagline}>{APP_TAGLINE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  glowOrb: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: palette.emberGlow,
  },
  glassOrb: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "rgba(18, 25, 38, 0.84)",
    borderColor: palette.glassStrokeHighlight,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  innerFlame: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  textContainer: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accentBright,
    marginTop: 6,
  },
  tagline: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },
});
