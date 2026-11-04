import { Platform } from "react-native";

/**
 * "Obsidian Liquid Glass / Spatial Cinema" design tokens.
 * Single source of visual truth across Mobile, Tablet, and Android TV.
 */
export const palette = {
  // Deep space canvas
  background: "#04060A",
  backgroundElevated: "#090D14",
  backgroundDeep: "#020305",
  surface: "#0E141E",
  surfaceRaised: "#141C2B",
  surfaceGlass: "rgba(16, 23, 35, 0.68)",

  // Liquid glass materials & fills
  glassFill: "rgba(255, 255, 255, 0.05)",
  glassFillSoft: "rgba(255, 255, 255, 0.03)",
  glassFillMedium: "rgba(255, 255, 255, 0.08)",
  glassFillStrong: "rgba(255, 255, 255, 0.13)",
  glassFillUltra: "rgba(255, 255, 255, 0.20)",

  // Specular strokes & rims
  glassStroke: "rgba(255, 255, 255, 0.12)",
  glassStrokeBright: "rgba(255, 255, 255, 0.26)",
  glassStrokeHighlight: "rgba(255, 255, 255, 0.45)",
  glassSpecular: "rgba(255, 255, 255, 0.65)",

  // Typography
  textPrimary: "#FFFFFF",
  textSecondary: "#A8B4C4",
  textMuted: "#6B7787",
  textDisabled: "#3D4653",

  // Kinetic Ember & Accent spectrum
  accent: "#FF5E3A",
  accentSoft: "#4A1C14",
  accentBright: "#FF8256",
  accentNeon: "#FF4500",
  accentGlow: "rgba(255, 94, 58, 0.32)",
  emberGlow: "rgba(255, 94, 58, 0.25)",

  // Chromatic highlights (prismatic refraction)
  chromaticCyan: "rgba(56, 189, 248, 0.4)",
  chromaticViolet: "rgba(168, 85, 247, 0.4)",
  chromaticEmber: "rgba(255, 94, 58, 0.5)",

  // Semantic status
  success: "#10B981",
  successSoft: "rgba(16, 185, 129, 0.18)",
  warning: "#F59E0B",
  warningSoft: "rgba(245, 158, 11, 0.18)",
  danger: "#EF4444",
  dangerSoft: "rgba(239, 68, 68, 0.18)",

  // Scrims & overlays
  scrim: "rgba(4, 6, 10, 0.88)",
  scrimSoft: "rgba(4, 6, 10, 0.55)",
  scrimUltra: "rgba(4, 6, 10, 0.96)",
} as const;

export const gradients = {
  accent: ["#FF5E3A", "#FF2D55"] as const,
  accentGlow: ["rgba(255, 94, 58, 0.45)", "rgba(255, 45, 85, 0)"] as const,
  aurora: ["#6366F1", "#A855F7", "#EC4899"] as const,
  glassSheen: [
    "rgba(255, 255, 255, 0.28)",
    "rgba(255, 255, 255, 0.08)",
    "rgba(255, 255, 255, 0.00)",
  ] as const,
  glassSheenSoft: [
    "rgba(255, 255, 255, 0.16)",
    "rgba(255, 255, 255, 0.04)",
    "rgba(255, 255, 255, 0.00)",
  ] as const,
  scrimDown: [
    "transparent",
    "rgba(4, 6, 10, 0.4)",
    "rgba(4, 6, 10, 0.85)",
    "#04060A",
  ] as const,
  scrimUp: [
    "#04060A",
    "rgba(4, 6, 10, 0.8)",
    "rgba(4, 6, 10, 0.2)",
    "transparent",
  ] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 18,
  sheet: 26,
  dock: 32,
  pill: 999,
} as const;

export const typeScale = {
  display: { fontSize: 34, fontWeight: "800" as const, letterSpacing: -1 },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.5 },
  headline: { fontSize: 18, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
} as const;

export const posterRatio = { width: 2, height: 3 } as const;
export const isTv = Platform.isTV;
