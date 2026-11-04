import { palette, radius } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * AmbientGlow — the "cinema projector" layer. Two soft ember pools breathe
 * behind a hero, giving dark surfaces depth. Static (no loop) when the OS asks
 * for reduced motion or on low-tier hardware; purely decorative everywhere.
 */
export function AmbientGlow({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  const afford = canAffordAmbience();
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced || !afford) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.55, duration: 3400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 3400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, afford, breathe]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.pool, styles.poolLeft, { opacity: breathe }]} />
      <Animated.View style={[styles.pool, styles.poolRight, { opacity: reduced || !afford ? 0.7 : breathe }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pool: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: radius.pill,
    backgroundColor: palette.emberGlow,
  },
  poolLeft: { top: -160, left: -120 },
  poolRight: { top: -80, right: -140, opacity: 0.7 },
});
