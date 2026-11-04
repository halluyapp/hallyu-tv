import { palette, radius, gradients } from "@/design-system/tokens";
import { liftShadow, glowShadow } from "@/design-system/depth";
import { useSound, type SoundName } from "@/services/sound/SoundContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

export interface GlassPanelProps extends PressableProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  pressedScale?: number;
  focusedScale?: number;
  haptic?: boolean;
  sound?: SoundName | false;
  variant?: "standard" | "prominent" | "pill" | "card" | "sheet" | "floating";
  glow?: boolean | string;
  hasSheen?: boolean;
}

export function GlassPanel({
  children,
  style,
  contentStyle,
  padding,
  borderRadius = radius.card,
  pressedScale = 0.97,
  focusedScale = 1.05,
  haptic = false,
  sound = false,
  variant = "card",
  glow = false,
  hasSheen = true,
  onFocus,
  onBlur,
  ...rest
}: GlassPanelProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);
  const { play, hapticsEnabled } = useSound();
  const reducedMotion = useReducedMotion();

  const handlePressIn = useCallback(
    (e: any) => {
      if (!reducedMotion) {
        Animated.spring(scale, {
          toValue: pressedScale,
          useNativeDriver: true,
          speed: 45,
          bounciness: 4,
        }).start();
      }
      if (haptic && hapticsEnabled) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      if (sound) play(sound);
      rest.onPressIn?.(e);
    },
    [scale, pressedScale, reducedMotion, haptic, hapticsEnabled, sound, play, rest],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      if (!reducedMotion) {
        Animated.spring(scale, {
          toValue: isFocused ? focusedScale : 1,
          useNativeDriver: true,
          speed: 35,
          bounciness: 6,
        }).start();
      }
      rest.onPressOut?.(e);
    },
    [scale, isFocused, focusedScale, reducedMotion, rest],
  );

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);
      if (!reducedMotion) {
        Animated.spring(scale, {
          toValue: focusedScale,
          useNativeDriver: true,
          speed: 35,
          bounciness: 8,
        }).start();
      }
      play("tab");
      onFocus?.(e);
    },
    [scale, focusedScale, reducedMotion, play, onFocus],
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);
      if (!reducedMotion) {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
        }).start();
      }
      onBlur?.(e);
    },
    [scale, reducedMotion, onBlur],
  );

  const elevationStyle =
    variant === "floating"
      ? liftShadow(3)
      : variant === "sheet"
      ? liftShadow(4)
      : variant === "prominent"
      ? liftShadow(2)
      : liftShadow(1);

  const glowStyle =
    isFocused
      ? glowShadow(palette.accent, 22)
      : glow
      ? glowShadow(typeof glow === "string" ? glow : palette.accentGlow, 18)
      : null;

  return (
    <Animated.View
      style={[
        elevationStyle,
        glowStyle,
        { transform: [{ scale }] },
        style,
      ]}
    >
      <Pressable
        {...rest}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.container,
          {
            borderRadius,
            borderColor: isFocused ? palette.accentBright : palette.glassStroke,
            borderWidth: isFocused ? 2 : StyleSheet.hairlineWidth,
            backgroundColor:
              variant === "prominent"
                ? palette.glassFillStrong
                : variant === "floating"
                ? palette.surfaceGlass
                : palette.glassFill,
          },
        ]}
      >
        {/* Specular curved reflection glint on top */}
        {hasSheen ? (
          <LinearGradient
            colors={gradients.glassSheen}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 0.6 }}
            style={styles.sheen}
            pointerEvents="none"
          />
        ) : null}

        {/* Highlight hairline bevel across top rim */}
        <View
          style={[
            styles.rimHighlight,
            { backgroundColor: isFocused ? palette.accentBright : palette.glassStrokeHighlight },
          ]}
          pointerEvents="none"
        />

        <View style={[styles.content, padding != null && { padding }, contentStyle]}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    position: "relative",
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    height: "55%",
  },
  rimHighlight: {
    position: "absolute",
    top: 0,
    left: "15%",
    right: "15%",
    height: 1,
    opacity: 0.7,
  },
  content: {
    position: "relative",
  },
});
