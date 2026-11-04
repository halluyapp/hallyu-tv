import { motion } from "@/design-system/motion";
import { palette } from "@/design-system/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

interface TvFocusableProps extends Omit<PressableProps, "style" | "children"> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Style applied while focused (merged after `style`). */
  focusedStyle?: StyleProp<ViewStyle>;
  /** Focus lift. Pass 1 for flat controls like pills and rows. */
  focusScale?: number;
}

/**
 * A single focus surface for television controls.
 *
 * `Pressable` does not expose focus in its style callback on Android TV, so
 * every focusable control in previous builds re-implemented focus state by hand
 * — and several forgot the ring entirely. This does it once: tracks focus,
 * applies the cyan edge, and optionally lifts the control.
 */
export function TvFocusable({
  children,
  style,
  focusedStyle,
  focusScale = 1,
  onFocus,
  onBlur,
  ...rest
}: TvFocusableProps) {
  const [focused, setFocused] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const handleFocus = useCallback(
    (e: Parameters<NonNullable<PressableProps["onFocus"]>>[0]) => {
      setFocused(true);
      if (!reduced && focusScale !== 1) {
        Animated.timing(lift, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
      }
      onFocus?.(e);
    },
    [onFocus, reduced, focusScale, lift],
  );

  const handleBlur = useCallback(
    (e: Parameters<NonNullable<PressableProps["onBlur"]>>[0]) => {
      setFocused(false);
      if (!reduced && focusScale !== 1) {
        Animated.timing(lift, { toValue: 0, duration: motion.fast, useNativeDriver: true }).start();
      }
      onBlur?.(e);
    },
    [onBlur, reduced, focusScale, lift],
  );

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, focusScale] });

  return (
    <Pressable
      {...rest}
      focusable
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[style, focused ? { borderColor: palette.cyan, borderWidth: 3 } : null, focused ? focusedStyle : null]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
