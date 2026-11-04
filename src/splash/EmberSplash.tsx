import { palette, spacing, gradients } from "@/design-system/tokens";
import { APP_NAME, APP_TAGLINE } from "@/config/branding";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

/** Spatial 3D Liquid Glass Splash with animated luminous ember core. */
export function EmberSplash() {
  const pulse = useRef(new Animated.Value(0.6)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const rotateLoop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseLoop.start();
    rotateLoop.start();

    return () => {
      pulseLoop.stop();
      rotateLoop.stop();
    };
  }, [pulse, rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const scale = pulse.interpolate({
    inputRange: [0.6, 1],
    outputRange: [0.94, 1.05],
  });

  return (
    <View style={styles.root}>
      {/* Outer ambient glow */}
      <Animated.View
        style={[
          styles.glowOrb,
          {
            opacity: pulse,
            transform: [{ scale }],
          },
        ]}
      />

      {/* Rotating Prismatic Glass Ring */}
      <Animated.View style={[styles.outerRing, { transform: [{ rotate: spin }] }]}>
        <LinearGradient
          colors={["rgba(255, 94, 58, 0.6)", "rgba(56, 189, 248, 0.4)", "rgba(168, 85, 247, 0.5)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Liquid Glass Center Sphere */}
      <Animated.View style={[styles.glassOrb, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={gradients.glassSheen}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 0.7 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.innerFlame}
        />
      </Animated.View>

      <View style={styles.textContainer}>
        <Text style={styles.wordmark}>{APP_NAME}</Text>
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
    position: "relative",
  },
  glowOrb: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: palette.emberGlow,
  },
  outerRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    padding: 2,
    overflow: "hidden",
    position: "absolute",
  },
  glassOrb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(18, 25, 38, 0.85)",
    borderColor: palette.glassStrokeBright,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: palette.accent,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  innerFlame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    shadowColor: palette.accent,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 6,
  },
  textContainer: {
    alignItems: "center",
    marginTop: spacing.md,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  tagline: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
