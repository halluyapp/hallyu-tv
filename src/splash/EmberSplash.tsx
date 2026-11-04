import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { APP_NAME } from "@/config/branding";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

/** Restrained native splash: app mark with a single ember pulse. */
export function EmberSplash() {
  const glow = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.55, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [glow]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.mark, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0.55, 1], outputRange: [0.96, 1.04] }) }] }]}>
        <View style={styles.flame} />
      </Animated.View>
      <Text style={styles.wordmark}>{APP_NAME}</Text>
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
  mark: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.glassStrokeStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  flame: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.cyan,
  },
  wordmark: {
    ...typeScale.title,
    color: palette.textPrimary,
    letterSpacing: 5,
    textTransform: "uppercase",
  },
});
