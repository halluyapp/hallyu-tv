/**
 * Depth — the physical vocabulary of the "Liquid Obsidian" stage.
 *
 * There is no WebGL here and there never will be: an Android box is not a
 * games console. Depth is a set of perceptual cues — perspective, relative
 * scale, occlusion, haze, light spill and shadow — applied with transforms and
 * opacity only, so every layer stays on the native driver at 60fps.
 */

import type { ViewStyle } from "react-native";

/** Camera distance for perspective transforms. Smaller = more dramatic. */
export const lens = 1200;

export const glass = {
  fill: "rgba(18,22,28,0.52)",
  fillStrong: "rgba(23,28,35,0.74)",
  fillSoft: "rgba(18,22,28,0.30)",
  rim: "rgba(235,242,248,0.14)",
  rimLit: "rgba(255,196,168,0.60)",
  /** Specular sheen: bright at the top edge, gone by the middle. */
  sheen: ["rgba(255,255,255,0.22)", "rgba(255,255,255,0.055)", "rgba(255,255,255,0.00)"] as const,
  ember: "rgba(240,120,85,0.24)",
  emberBright: "rgba(255,144,112,0.42)",
  haze: "#080A0D",
  ink: "#160B08",
  inkDeep: "#1A0E0A",
} as const;

/** Neutral contact shadow ramp. Accent bloom is drawn separately. */
export function liftShadow(level: 0 | 1 | 2 | 3): ViewStyle {
  if (level === 0) return {};
  if (level === 1) {
    return {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    };
  }
  if (level === 2) {
    return {
      shadowColor: "#000",
      shadowOpacity: 0.36,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 9,
    };
  }
  return {
    shadowColor: "#000",
    shadowOpacity: 0.48,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  };
}
