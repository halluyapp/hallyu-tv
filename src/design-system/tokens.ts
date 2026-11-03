import { Platform } from "react-native";

/**
 * "Obsidian Glass / Emberlight" design tokens — the single source of visual truth.
 * Never hard-code colours in screens; import from here.
 */
export const palette = {
  background: "#080A0D",
  backgroundElevated: "#10151B",
  surface: "#151B22",
  surfaceRaised: "#1B232C",
  glassFill: "rgba(225,235,245,0.055)",
  glassFillStrong: "rgba(225,235,245,0.10)",
  glassStroke: "rgba(235,242,248,0.13)",
  textPrimary: "#F4F2ED",
  textSecondary: "#A4ADB8",
  textMuted: "#6F7A86",
  accent: "#F07855",
  accentSoft: "#65382F",
  accentBright: "#FF9070",
  success: "#68B68D",
  warning: "#E5B35E",
  danger: "#E06B70",
  emberGlow: "rgba(240,120,85,0.22)",
  scrim: "rgba(8,10,13,0.82)",
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
  sm: 10,
  md: 14,
  card: 18,
  sheet: 24,
  pill: 999,
} as const;

export const typeScale = {
  display: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  micro: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.6, textTransform: "uppercase" as const },
} as const;

/** Motion timing system (ms). Micro-interactions, standard, hero. */
export const motion = {
  micro: 150,
  standard: 260,
  hero: 380,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

export const posterRatio = { width: 2, height: 3 } as const;
export const isTv = Platform.isTV;
