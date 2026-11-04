/**
 * Motion — the shared timing and spring vocabulary.
 *
 * Every transition in the app must name one of these. Bespoke durations are
 * what make a product feel assembled rather than directed: two screens that
 * both "fade" at 150ms and 260ms are not the same film.
 *
 * Rules:
 *  - Transforms and opacity only (native driver). Never animate layout.
 *  - `cinematic` is reserved for one arrival per screen, never navigation.
 *  - Reduced motion is honoured by the caller: movement becomes opacity.
 */

export const motion = {
  /** Focus acknowledgement — must feel instant under a d-pad. */
  instant: 90,
  fast: 160,
  normal: 240,
  slow: 420,
  cinematic: 680,
} as const;

/** Bezier curves matching the tiers (used where a curve is accepted). */
export const easing = {
  enter: [0.22, 1, 0.36, 1],
  exit: [0.4, 0, 1, 1],
  glide: [0.16, 1, 0.3, 1],
} as const;

/** Named springs — the physical character of the stage. */
export const springs = {
  /** A card or key settling under focus. Quick, slightly overshooting. */
  focus: { damping: 18, stiffness: 220, mass: 0.9 },
  /** Press feedback. Short and heavy so it reads as contact. */
  press: { damping: 20, stiffness: 260, mass: 0.8 },
  /** Player chrome rising into place. Heavier, with a little weight. */
  chrome: { damping: 21, stiffness: 170, mass: 1 },
  /** Large panels and sheets. */
  sheet: { damping: 24, stiffness: 150, mass: 1.05 },
} as const;

/** Delay between sibling rows/cards arriving. */
export const stagger = 55;

export type MotionTier = keyof typeof motion;
