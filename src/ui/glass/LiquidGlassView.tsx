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
 * - On Android phones & TVs, avoids `dimezisBlurView` (which re-draws the entire
 *   view hierarchy into an offscreen Canvas on every `onPreDraw` scroll frame!)
 *   and instead renders zero-cost GPU-composited smoked crystal refraction +
 *   multi-stop diagonal glass sheen + 1px top specular rim highlight.
 * - On iOS, leverages OS-composited `UIVisualEffectView` on floating docks.
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
    Platform.OS === "ios" &&
    profile.allowLiveBlur &&
    (variant === "dock" || variant === "frosted");

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
          style={[
            styles.topSpecular,
            {
              left: Math.min(20, borderRadius * 0.55),
              right: Math.min(20, borderRadius * 0.55),
            },
          ]}
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
      return liveBlur ? "rgba(12, 17, 27, 0.52)" : "rgba(13, 19, 30, 0.88)";
    case "frosted":
      return liveBlur ? "rgba(18, 25, 38, 0.46)" : "rgba(18, 26, 39, 0.82)";
    case "card":
      return "rgba(18, 25, 38, 0.72)";
    case "pearl":
      return "#FFF7F1";
    case "ember":
      return "#FF7656";
    case "emberSolid":
      return "#FF6242";
    case "emerald":
      return "rgba(22, 74, 58, 0.76)";
  }
}

function gradientFor(variant: GlassVariant): readonly [string, string, ...string[]] {
  switch (variant) {
    case "dock":
      return [
        "rgba(255, 255, 255, 0.22)",
        "rgba(255, 255, 255, 0.05)",
        "rgba(255, 132, 98, 0.07)",
        "rgba(255, 255, 255, 0.11)",
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
