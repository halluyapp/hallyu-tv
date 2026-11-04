import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { glowBlue, glowCyan } from "@/design-system/gradients";

/**
 * AmbientGlow — the atmospheric layer behind heroes and empty states.
 *
 * Two soft blue light pools and one cyan rim, painted as radial-ish gradient
 * ellipses. This is the "cinematic backlight" of the app: it gives a dark
 * surface depth without putting a live blur behind content.
 *
 * Cost control: the breathing loop is skipped on low-tier devices and when the
 * OS asks for reduced motion, in which case the pools render at a fixed opacity.
 * Purely decorative (`pointerEvents="none"`), never interactive.
 */
export function AmbientGlow({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  const animate = canAffordAmbience() && !reduced;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.62, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, breathe]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.pool, styles.poolLeft, animate ? { opacity: breathe } : { opacity: 0.8 }]}>
        <LinearGradient
          colors={glowBlue}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.pool, styles.poolRight, animate ? { opacity: breathe } : { opacity: 0.55 }]}>
        <LinearGradient
          colors={glowCyan}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {children}
    </View>
  );
}

/** A single static glow — cheap, for cards and empty states. */
export function StaticGlow({ tone = "blue", size = 260 }: { tone?: "blue" | "cyan"; size?: number }) {
  const colors = tone === "cyan" ? glowCyan : glowBlue;
  return (
    <View pointerEvents="none" style={[styles.static, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient colors={colors} start={{ x: 0.3, y: 0.2 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  pool: { position: "absolute", width: 460, height: 460, borderRadius: 230, overflow: "hidden" },
  poolLeft: { top: -190, left: -150 },
  poolRight: { bottom: -220, right: -170 },
  static: { position: "absolute", overflow: "hidden" },
});
