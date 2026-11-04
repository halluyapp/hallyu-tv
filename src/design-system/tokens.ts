/**
 * Hallyu TV — "Deep Blue Liquid Glass" design tokens.
 *
 * The single source of visual truth. Screens must never hard-code a colour;
 * `tests/design-system.test.ts` fails the build if a raw colour literal appears
 * outside this folder.
 *
 * The palette is built from one midnight-navy environment, one electric-blue
 * light source, and one icy-cyan highlight. Everything else is a tint of those
 * three. That is what keeps the app looking like one product instead of a
 * collection of blue rectangles.
 */

export const palette = {
  /** Ambient environment — the room the app lives in. */
  void: "#03050B",
  background: "#050810",
  backgroundElevated: "#080D18",
  surface: "#0B1220",
  surfaceRaised: "#101A2C",
  surfaceBright: "#152B44",

  /** Glass tints: cool, low-chroma, always translucent. */
  glassFill: "rgba(120,170,255,0.055)",
  glassFillStrong: "rgba(130,180,255,0.10)",
  glassFillHeavy: "rgba(16,26,44,0.72)",
  glassStroke: "rgba(150,195,255,0.16)",
  glassStrokeStrong: "rgba(170,215,255,0.34)",
  glassHighlight: "rgba(210,235,255,0.55)",

  /** Text. */
  textPrimary: "#EAF2FF",
  textSecondary: "#9FB2CC",
  textMuted: "#66799A",
  textOnAccent: "#02060F",

  /** Light source: electric blue. */
  accent: "#3D7BFF",
  accentBright: "#6FA0FF",
  accentDeep: "#1B44B8",
  accentSoft: "rgba(61,123,255,0.16)",

  /** Highlight: icy cyan. */
  cyan: "#6FE3FF",
  cyanSoft: "rgba(111,227,255,0.14)",

  /** Status. */
  success: "#3FD8A4",
  warning: "#FFC65C",
  danger: "#FF6B81",
  dangerSoft: "rgba(255,107,129,0.16)",
  dangerEdge: "rgba(255,107,129,0.50)",

  /** Composite helpers used by gradients and glows. */
  glow: "rgba(61,123,255,0.24)",
  glowCyan: "rgba(111,227,255,0.18)",
  scrim: "rgba(3,5,11,0.82)",
  scrimStrong: "rgba(3,5,11,0.94)",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 20,
  sheet: 28,
  hero: 32,
  pill: 999,
} as const;

/**
 * Typography scale. Display weights use the bundled Sora face; body copy uses
 * the system font (better legibility at small sizes and zero bundle cost).
 * TV gets its own larger scale — see `typeScaleFor`.
 */
export const typeScale = {
  hero: { fontFamily: "Sora_800ExtraBold", fontSize: 40, letterSpacing: -1.6, lineHeight: 44 },
  display: { fontFamily: "Sora_700Bold", fontSize: 28, letterSpacing: -0.9, lineHeight: 34 },
  title: { fontFamily: "Sora_600SemiBold", fontSize: 20, letterSpacing: -0.3, lineHeight: 26 },
  headline: { fontFamily: "Sora_600SemiBold", fontSize: 16, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 19 },
  micro: { fontFamily: "Sora_600SemiBold", fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase" as const },
} as const;

/** TV-distance scale: everything steps up ~35% and gains line height. */
export const tvTypeScale = {
  hero: { fontFamily: "Sora_800ExtraBold", fontSize: 54, letterSpacing: -2, lineHeight: 60 },
  display: { fontFamily: "Sora_700Bold", fontSize: 38, letterSpacing: -1.2, lineHeight: 46 },
  title: { fontFamily: "Sora_600SemiBold", fontSize: 27, letterSpacing: -0.4, lineHeight: 34 },
  headline: { fontFamily: "Sora_600SemiBold", fontSize: 21, lineHeight: 28 },
  body: { fontSize: 19, lineHeight: 28 },
  caption: { fontSize: 17, lineHeight: 24 },
  micro: { fontFamily: "Sora_600SemiBold", fontSize: 14, letterSpacing: 1.4, textTransform: "uppercase" as const },
} as const;

export function typeScaleFor(isTv: boolean) {
  return isTv ? tvTypeScale : typeScale;
}

/** Poster geometry — the one aspect ratio the whole catalogue uses. */
export const posterRatio = { width: 2, height: 3 } as const;
/** 16:9 for backdrops, hero art and episode stills. */
export const wideRatio = { width: 16, height: 9 } as const;

/** Minimum touch / focus target. TV needs more than a fingertip. */
export const hitTarget = { mobile: 44, tv: 64 } as const;

/** Overscan-safe gutter for television displays. */
export const tvSafeArea = { horizontal: 48, vertical: 27 } as const;

