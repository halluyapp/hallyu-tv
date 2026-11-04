/**
 * Named gradient + scrim stops.
 *
 * Screens must not hand-write colour arrays: a hero over bright artwork and a
 * caption over a dark poster need different scrim strengths, and doing that
 * inline in nine files is how a theme drifts. Every stop here is expressed in
 * the midnight-navy family so overlays always agree with the background.
 */

/** Bottom-up hero scrim: transparent at the top, opaque navy at the base. */
export const heroScrim = ["rgba(5,8,16,0.00)", "rgba(5,8,16,0.55)", "rgba(5,8,16,0.94)", "rgba(5,8,16,1)"] as const;
export const heroScrimPositions = [0.2, 0.55, 0.85, 1] as const;

/** Softer variant for large TV heroes that keep more artwork visible. */
export const heroScrimSoft = ["rgba(5,8,16,0.00)", "rgba(5,8,16,0.6)", "rgba(5,8,16,0.95)"] as const;
export const heroScrimSoftPositions = [0.15, 0.6, 1] as const;

/** Caption scrim for small tiles: only the bottom third darkens. */
export const cardScrim = ["rgba(5,8,16,0)", "rgba(5,8,16,0.35)", "rgba(5,8,16,0.92)"] as const;

/** Flat scrim used under a play affordance. */
export const playbackScrim = ["rgba(5,8,16,0)", "rgba(5,8,16,0.85)"] as const;

/** Fallback artwork plate: deep navy with a cold light from the top-left. */
export const posterFallback = ["#12203A", "#0A1120", "#070C18"] as const;
export const posterFallbackLight = ["rgba(111,227,255,0.20)", "rgba(61,123,255,0.06)", "rgba(61,123,255,0)"] as const;

/** Loading sheen on an undecoded poster. */
export const posterSheen = ["rgba(160,205,255,0.10)", "rgba(160,205,255,0.02)", "rgba(160,205,255,0)"] as const;

/** Ambient pools behind heroes. */
export const glowBlue = ["rgba(61,123,255,0.34)", "rgba(61,123,255,0.10)", "rgba(61,123,255,0)"] as const;
export const glowCyan = ["rgba(111,227,255,0.26)", "rgba(111,227,255,0.06)", "rgba(111,227,255,0)"] as const;

/** Genre tile washes. */
export const genreWashBlue = ["rgba(61,123,255,0.30)", "rgba(61,123,255,0.04)"] as const;
export const genreWashCyan = ["rgba(111,227,255,0.28)", "rgba(61,123,255,0.05)"] as const;

/** Primary action fill. */
export const accentButton = ["#6FA0FF", "#3D7BFF", "#2A5BE0"] as const;

/** Solid translucency helpers (not gradients) used by chrome over video. */
export const chrome = {
  scrimSoft: "rgba(6,10,20,0.66)",
  scrimMid: "rgba(10,16,30,0.72)",
  scrimStrong: "rgba(5,8,16,0.94)",
  trackDim: "rgba(234,242,255,0.18)",
  trackBuffered: "rgba(234,242,255,0.30)",
  hairline: "rgba(150,195,255,0.08)",
  panelTint: "rgba(8,13,24,0.62)",
  panelTintOpaque: "rgba(8,13,24,0.94)",
} as const;
