import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, type ReactNode } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { gradients, palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";

export type GlassVariant =
  | "dock"
  | "frosted"
  | "card"
  | "pearl"
  | "ember"
  | "emberSolid"
  | "emerald";

interface LiquidGlassViewProps {
  children?: ReactNode;
  variant?: GlassVariant;
  borderRadius?: number;
  blurIntensity?: number;
  /** Adds a crisp 10-foot luminous pearl + warm coral outer halo when focused on TV. */
  focused?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Core Optical Liquid Glass surface matching the approved tvOS 26 / iOS 26
 * design language 1-to-1:
 * - Floating docks/modals (`dock`, `frosted`) apply real optical BlurView on
 *   standard/high-RAM devices and gracefully switch to high-clarity smoked
 *   crystal refraction on 2 GB RAM devices so frame rate stays locked at 60fps.
 * - List cells (`card`) never allocate per-cell BlurView render targets.
 * - Every surface receives a diagonal glass sheen + razor-sharp 1px top
 *   specular rim highlight.
 */
export const LiquidGlassView = memo(function LiquidGlassView({
  children,
  variant = "frosted",
  borderRadius = radius.card,
  blurIntensity = 38,
  focused = false,
  style,
  contentStyle,
}: LiquidGlassViewProps) {
  const profile = usePerformanceProfile();
  const shouldUseLiveBlur =
    profile.allowLiveBlur && (variant === "dock" || variant === "frosted");

  const borderColor = focused
    ? "#FFF6EE"
    : variant === "pearl"
      ? "rgba(255, 255, 255, 0.92)"
      : variant === "ember" || variant === "emberSolid"
        ? "rgba(255, 238, 228, 0.85)"
        : variant === "emerald"
          ? "rgba(246, 196, 83, 0.62)"
          : variant === "dock"
            ? palette.glassStrokeBright
            : palette.glassStroke;

  const borderWidth = focused ? 2 : 1;

  return (
    <View
      style={[
        styles.outer,
        { borderRadius },
        focused && styles.focusedShadow,
        variant === "dock" && styles.dockShadow,
        (variant === "ember" || variant === "emberSolid") && styles.emberShadow,
        variant === "pearl" && styles.pearlShadow,
        style,
      ]}
    >
      <View
        style={[
          styles.clip,
          {
            borderRadius,
            borderColor,
            borderWidth,
            backgroundColor: baseBackgroundFor(variant, shouldUseLiveBlur),
          },
        ]}
      >
        {shouldUseLiveBlur ? (
          <BlurView
            intensity={blurIntensity}
            tint="dark"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <LinearGradient
          colors={gradientFor(variant)}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top optical specular refraction hairline */}
        <LinearGradient
          colors={gradients.topSpecular}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.topSpecular, { left: Math.min(20, borderRadius * 0.55), right: Math.min(20, borderRadius * 0.55) }]}
          pointerEvents="none"
        />

        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
});

function baseBackgroundFor(variant: GlassVariant, liveBlur: boolean): string {
  switch (variant) {
    case "dock":
      return liveBlur ? "rgba(12, 17, 27, 0.52)" : "rgba(14, 20, 31, 0.84)";
    case "frosted":
      return liveBlur ? "rgba(18, 25, 38, 0.46)" : "rgba(19, 27, 40, 0.78)";
    case "card":
      return "rgba(18, 25, 38, 0.68)";
    case "pearl":
      return "#FFF7F1";
    case "ember":
      return "#FF7656";
    case "emberSolid":
      return "#FF6242";
    case "emerald":
      return "rgba(22, 74, 58, 0.72)";
  }
}

function gradientFor(variant: GlassVariant): readonly [string, string, ...string[]] {
  switch (variant) {
    case "dock":
      return [
        "rgba(255, 255, 255, 0.20)",
        "rgba(255, 255, 255, 0.04)",
        "rgba(255, 132, 98, 0.06)",
        "rgba(255, 255, 255, 0.10)",
      ];
    case "frosted":
      return gradients.glassSheen;
    case "card":
      return gradients.glassSheenSoft;
    case "pearl":
      return gradients.pearlCapsule;
    case "ember":
      return gradients.emberCapsule;
    case "emberSolid":
      return gradients.emberSolid;
    case "emerald":
      return gradients.emeraldShield;
  }
}

const styles = StyleSheet.create({
  outer: {
    position: "relative",
  },
  clip: {
    overflow: "hidden",
  },
  topSpecular: {
    position: "absolute",
    top: 0,
    height: 1.2,
  },
  content: {
    position: "relative",
  },
  dockShadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.48,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  focusedShadow: {
    shadowColor: palette.accent,
    shadowOpacity: 0.62,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  emberShadow: {
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  pearlShadow: {
    shadowColor: "#FFF4EC",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
