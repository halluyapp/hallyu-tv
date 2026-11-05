import { Platform } from "react-native";

/**
 * Hallyu Optical Liquid Glass Cinema Tokens ("Seoul Crystal & Sunset Ember").
 * Zero purple/neon gradients — pure optical crystal, smoked obsidian, warm
 * pearl white, champagne gold, emerald verification, and sunset coral-ember.
 */
export const palette = {
  // Deep cinema obsidian canvas
  background: "#05080E",
  backgroundElevated: "#0A0F18",
  backgroundDeep: "#030508",
  surface: "#0D131E",
  surfaceRaised: "#141D2C",
  surfaceGlass: "rgba(18, 25, 38, 0.62)",

  // Optical Liquid Glass fills
  glassFill: "rgba(255, 255, 255, 0.07)",
  glassFillSoft: "rgba(255, 255, 255, 0.04)",
  glassFillMedium: "rgba(255, 255, 255, 0.11)",
  glassFillStrong: "rgba(255, 255, 255, 0.17)",
  glassFillUltra: "rgba(255, 255, 255, 0.25)",
  glassDockTint: "rgba(14, 20, 31, 0.66)",
  glassCardTint: "rgba(18, 25, 38, 0.56)",

  // Specular strokes & optical refraction rims
  glassStroke: "rgba(255, 255, 255, 0.18)",
  glassStrokeBright: "rgba(255, 255, 255, 0.34)",
  glassStrokeHighlight: "rgba(255, 255, 255, 0.58)",
  glassSpecular: "rgba(255, 255, 255, 0.78)",

  // Pearl active crystal
  pearl: "#FFF8F3",
  pearlSoft: "#FFEADF",
  pearlInk: "#090D14",

  // Typography
  textPrimary: "#FFFFFF",
  textSecondary: "#BAC5D4",
  textMuted: "#7B889B",
  textDisabled: "#475263",

  // Sunset Coral-Ember primary & TV focus glow
  accent: "#FF6242",
  accentSoft: "rgba(255, 98, 66, 0.20)",
  accentBright: "#FF8F70",
  accentNeon: "#FF5230",
  accentGlow: "rgba(255, 98, 66, 0.42)",
  emberGlow: "rgba(255, 118, 82, 0.32)",

  // Rating & security accents
  gold: "#F6C453",
  goldSoft: "rgba(246, 196, 83, 0.20)",
  chromaticCyan: "rgba(180, 220, 255, 0.28)",
  chromaticEmber: "rgba(255, 110, 74, 0.45)",

  // Semantic status
  success: "#34D399",
  successSoft: "rgba(52, 211, 153, 0.20)",
  warning: "#F6C453",
  warningSoft: "rgba(246, 196, 83, 0.20)",
  danger: "#F87171",
  dangerSoft: "rgba(248, 113, 113, 0.20)",

  // Scrims & overlays
  scrim: "rgba(5, 8, 14, 0.86)",
  scrimSoft: "rgba(5, 8, 14, 0.54)",
  scrimUltra: "rgba(5, 8, 14, 0.94)",
} as const;

export const gradients = {
  accent: ["#FF9575", "#FF6242", "#E8492A"] as const,
  emberCapsule: ["#FFF3EB", "#FF9878", "#FF6242"] as const,
  emberSolid: ["#FF8864", "#FF6242", "#EA4A2B"] as const,
  pearlCapsule: ["#FFFFFF", "#FFF5EE", "#FFE4D5"] as const,
  progressFill: ["#FFB076", "#FF6A45"] as const,
  accentGlow: ["rgba(255, 112, 76, 0.46)", "rgba(255, 98, 66, 0)"] as const,
  glassSheen: [
    "rgba(255, 255, 255, 0.24)",
    "rgba(255, 255, 255, 0.05)",
    "rgba(255, 255, 255, 0.10)",
  ] as const,
  glassSheenSoft: [
    "rgba(255, 255, 255, 0.16)",
    "rgba(255, 255, 255, 0.03)",
    "rgba(255, 255, 255, 0.07)",
  ] as const,
  topSpecular: [
    "rgba(255, 255, 255, 0.10)",
    "rgba(255, 255, 255, 0.68)",
    "rgba(255, 255, 255, 0.12)",
  ] as const,
  emeraldShield: [
    "rgba(52, 211, 153, 0.34)",
    "rgba(20, 88, 68, 0.56)",
  ] as const,
  scrimDown: [
    "transparent",
    "rgba(5, 8, 14, 0.38)",
    "rgba(5, 8, 14, 0.84)",
    "#05080E",
  ] as const,
  scrimUp: [
    "#05080E",
    "rgba(5, 8, 14, 0.78)",
    "rgba(5, 8, 14, 0.22)",
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
  sheet: 28,
  dock: 32,
  pill: 999,
} as const;

export const typeScale = {
  display: { fontSize: 34, fontWeight: "800" as const, letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.4 },
  headline: { fontSize: 18, fontWeight: "700" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.7, textTransform: "uppercase" as const },
} as const;

export const posterRatio = { width: 2, height: 3 } as const;
export const isTv = Platform.isTV;
