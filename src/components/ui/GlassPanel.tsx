import { palette, radius } from "@/design-system/tokens";
import { useSound, type SoundName } from "@/services/sound/SoundContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
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
  /** UI tone played on press. Pass `false` to stay silent. */
  sound?: SoundName | false;
}

export function GlassPanel({ children, style, padding, pressedScale = 0.97, haptic = false, sound = false, ...rest }: GlassPanelProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { play, hapticsEnabled } = useSound();
  const reducedMotion = useReducedMotion();

  const onPressIn = useCallback(
    (e: any) => {
      // Reduced motion: keep the pressable response, drop the movement.
      if (!reducedMotion) Animated.spring(scale, { toValue: pressedScale, useNativeDriver: true, speed: 40 }).start();
      if (haptic && hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (sound) play(sound);
      rest.onPressIn?.(e);
    },
    [scale, pressedScale, reducedMotion, haptic, hapticsEnabled, sound, play, rest],
  );

  const onPressOut = useCallback(
    (e: any) => {
      if (!reducedMotion) Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
      rest.onPressOut?.(e);
    },
    [scale, reducedMotion, rest],
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
