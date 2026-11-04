import { palette, radius } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * AmbientGlow — Spatial Cinema Projector.
 * Casts multi-colored refractive light (kinetic ember, deep indigo, neon aurora)
 * behind liquid glass surfaces to create true 3D visual depth.
 */
export function AmbientGlow({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  const afford = canAffordAmbience();
  const breathe1 = useRef(new Animated.Value(0.7)).current;
  const breathe2 = useRef(new Animated.Value(0.5)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || !afford) return;

    const anim1 = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe1, {
          toValue: 1,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe1, {
          toValue: 0.65,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe2, {
          toValue: 0.9,
          duration: 4600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe2, {
          toValue: 0.45,
          duration: 3900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const animDrift = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    anim1.start();
    anim2.start();
    animDrift.start();

    return () => {
      anim1.stop();
      anim2.stop();
      animDrift.stop();
    };
  }, [reduced, afford, breathe1, breathe2, drift]);

  const driftX1 = drift.interpolate({ inputRange: [0, 1], outputRange: [-20, 25] });
  const driftY1 = drift.interpolate({ inputRange: [0, 1], outputRange: [-15, 20] });
  const driftX2 = drift.interpolate({ inputRange: [0, 1], outputRange: [20, -15] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Primary Kinetic Ember Pool */}
      <Animated.View
        style={[
          styles.pool,
          styles.poolEmber,
          {
            opacity: breathe1,
            transform: [{ translateX: driftX1 }, { translateY: driftY1 }],
          },
        ]}
      />

      {/* Secondary Cosmic Aurora / Cyan Pool */}
      <Animated.View
        style={[
          styles.pool,
          styles.poolAurora,
          {
            opacity: breathe2,
            transform: [{ translateX: driftX2 }],
          },
        ]}
      />

      {/* Tertiary Deep Violet Core */}
      <Animated.View
        style={[
          styles.pool,
          styles.poolViolet,
          {
            opacity: reduced || !afford ? 0.3 : breathe1.interpolate({ inputRange: [0.65, 1], outputRange: [0.25, 0.55] }),
          },
        ]}
      />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pool: {
    position: "absolute",
    borderRadius: radius.pill,
  },
  poolEmber: {
    top: -140,
    left: -100,
    width: 460,
    height: 460,
    backgroundColor: palette.emberGlow,
  },
  poolAurora: {
    top: -60,
    right: -120,
    width: 420,
    height: 420,
    backgroundColor: "rgba(56, 189, 248, 0.16)",
  },
  poolViolet: {
    top: 240,
    left: "20%",
    width: 360,
    height: 360,
    backgroundColor: "rgba(139, 92, 246, 0.12)",
  },
});
