import type { ViewStyle } from "react-native";

/** Camera distance for perspective transforms. Smaller = more dramatic 3D space. */
export const lens = 1000;

export const glass = {
  fill: "rgba(16, 23, 35, 0.65)",
  fillStrong: "rgba(22, 31, 46, 0.82)",
  fillSoft: "rgba(16, 23, 35, 0.42)",
  fillUltraSoft: "rgba(255, 255, 255, 0.04)",
  rim: "rgba(255, 255, 255, 0.14)",
  rimBright: "rgba(255, 255, 255, 0.32)",
  rimLit: "rgba(255, 140, 105, 0.65)",
  rimCyan: "rgba(56, 189, 248, 0.65)",
  /** Specular sheen: bright at the top edge, fading downward */
  sheen: ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.00)"] as const,
  sheenSubtle: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)", "transparent"] as const,
  ember: "rgba(255, 94, 58, 0.28)",
  emberBright: "rgba(255, 130, 86, 0.55)",
  emberNeon: "#FF5E3A",
  haze: "#04060A",
  ink: "#0E0705",
  inkDeep: "#140A07",
} as const;

/** Multi-tiered physical contact & refraction shadow ramp. */
export function liftShadow(level: 0 | 1 | 2 | 3 | 4): ViewStyle {
  switch (level) {
    case 0:
      return {};
    case 1:
      return {
        shadowColor: "#000",
        shadowOpacity: 0.28,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      };
    case 2:
      return {
        shadowColor: "#000",
        shadowOpacity: 0.42,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      };
    case 3:
      return {
        shadowColor: "#000",
        shadowOpacity: 0.58,
        shadowRadius: 32,
        shadowOffset: { width: 0, height: 16 },
        elevation: 16,
      };
    case 4:
      return {
        shadowColor: "#000",
        shadowOpacity: 0.72,
        shadowRadius: 48,
        shadowOffset: { width: 0, height: 24 },
        elevation: 24,
      };
  }
}

/** Glow shadow for focused or active liquid glass elements */
export function glowShadow(color = "rgba(255, 94, 58, 0.45)", radius = 24): ViewStyle {
  return {
    shadowColor: color,
    shadowOpacity: 0.85,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  };
}
