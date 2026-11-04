import { palette, radius, typeScale, gradients } from "@/design-system/tokens";
import { liftShadow, glowShadow } from "@/design-system/depth";
import { useSound } from "@/services/sound/SoundContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "glass";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: "sm" | "md" | "lg";
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  size = "md",
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);
  const { play, hapticsEnabled } = useSound();
  const reducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  const handlePressIn = useCallback(() => {
    if (!reducedMotion) {
      Animated.spring(scale, {
        toValue: 0.95,
        useNativeDriver: true,
        speed: 45,
        bounciness: 4,
      }).start();
    }
    if (!isDisabled) {
      if (hapticsEnabled && !reducedMotion) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      play("tap");
    }
  }, [scale, isDisabled, reducedMotion, hapticsEnabled, play]);

  const handlePressOut = useCallback(() => {
    if (!reducedMotion) {
      Animated.spring(scale, {
        toValue: isFocused ? 1.05 : 1,
        useNativeDriver: true,
        speed: 35,
        bounciness: 6,
      }).start();
    }
  }, [scale, isFocused, reducedMotion]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (!reducedMotion) {
      Animated.spring(scale, {
        toValue: 1.05,
        useNativeDriver: true,
        speed: 35,
      }).start();
    }
    play("tab");
  }, [scale, reducedMotion, play]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (!reducedMotion) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
      }).start();
    }
  }, [scale, reducedMotion]);

  const sizeStyles = {
    sm: { paddingVertical: 9, paddingHorizontal: 16, fontSize: 13, iconSize: 14 },
    md: { paddingVertical: 14, paddingHorizontal: 22, fontSize: 15, iconSize: 18 },
    lg: { paddingVertical: 18, paddingHorizontal: 30, fontSize: 17, iconSize: 22 },
  }[size];

  return (
    <Animated.View
      style={[
        { transform: [{ scale }], opacity: isDisabled ? 0.45 : 1 },
        variant === "primary" ? (isFocused ? glowShadow(palette.accent, 24) : liftShadow(2)) : null,
        isFocused && variant !== "primary" ? glowShadow(palette.glassSpecular, 16) : null,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.pressable,
          {
            borderRadius: radius.pill,
            borderColor: isFocused ? palette.accentBright : "transparent",
            borderWidth: isFocused ? 2 : 0,
          },
        ]}
      >
        {variant === "primary" ? (
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.base,
              {
                paddingVertical: sizeStyles.paddingVertical,
                paddingHorizontal: sizeStyles.paddingHorizontal,
              },
            ]}
          >
            {/* Top specular reflection bevel */}
            <View style={styles.topBevel} />
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                {icon}
                <Text style={[styles.primaryLabel, { fontSize: sizeStyles.fontSize }]}>
                  {label}
                </Text>
              </>
            )}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.base,
              {
                paddingVertical: sizeStyles.paddingVertical,
                paddingHorizontal: sizeStyles.paddingHorizontal,
                backgroundColor:
                  variant === "secondary" || variant === "glass"
                    ? palette.glassFillStrong
                    : variant === "danger"
                    ? palette.dangerSoft
                    : "transparent",
                borderColor:
                  variant === "secondary" || variant === "glass"
                    ? palette.glassStrokeBright
                    : variant === "danger"
                    ? "rgba(239, 68, 68, 0.4)"
                    : "transparent",
                borderWidth: variant === "quiet" ? 0 : StyleSheet.hairlineWidth,
              },
            ]}
          >
            {/* Liquid glass top sheen */}
            {variant === "secondary" || variant === "glass" ? (
              <LinearGradient
                colors={gradients.glassSheenSoft}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 0.6 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
            ) : null}

            {loading ? (
              <ActivityIndicator
                color={variant === "danger" ? palette.danger : palette.textPrimary}
                size="small"
              />
            ) : (
              <>
                {icon}
                <Text
                  style={[
                    styles.secondaryLabel,
                    {
                      fontSize: sizeStyles.fontSize,
                      color:
                        variant === "danger"
                          ? palette.danger
                          : variant === "quiet"
                          ? palette.textSecondary
                          : palette.textPrimary,
                    },
                  ]}
                >
                  {label}
                </Text>
              </>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    position: "relative",
  },
  topBevel: {
    position: "absolute",
    top: 0,
    left: "10%",
    right: "10%",
    height: 1.2,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  primaryLabel: {
    ...typeScale.headline,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  secondaryLabel: {
    ...typeScale.headline,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
