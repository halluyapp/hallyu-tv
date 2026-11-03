import { motion } from "@/design-system/motionConfig";
import { palette, radius } from "@/design-system/tokens";
import React, { useCallback, useRef } from "react";
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Tactile pressable glass surface: subtle scale on press (UI thread), hairline
 * stroke, translucent fill. Used for cards and floating panels.
 */
interface GlassPanelProps extends PressableProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  pressedScale?: number;
  haptic?: boolean;
}

export function GlassPanel({ children, style, padding, pressedScale = 0.97, haptic = false, ...rest }: GlassPanelProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(
    (e: any) => {
      Animated.spring(scale, { toValue: pressedScale, useNativeDriver: true, speed: 40 }).start();
      if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      rest.onPressIn?.(e);
    },
    [scale, pressedScale, haptic, rest],
  );

  const onPressOut = useCallback(
    (e: any) => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
      rest.onPressOut?.(e);
    },
    [scale, rest],
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable {...rest} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={[styles.panel, padding != null && { padding }]}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    overflow: "hidden",
  },
});
