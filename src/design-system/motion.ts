/**
 * Motion tokens — the shared timing/easing vocabulary ("Liquid Cinema" motion
 * system). Screens and components must use these tiers instead of bespoke
 * durations so the whole app breathes at the same rhythm.
 *
 * Tiers: fast = press/focus feedback · normal = routine transitions ·
 * slow = sheets and reveals · cinematic = the rare opening flourish.
 * Nothing in primary navigation may exceed `cinematic`.
 */
export const motion = {
  fast: 160,
  normal: 240,
  slow: 420,
  cinematic: 680,
} as const;

/** Cubic-bezier curves matching the tiers (documented + used by native springs). */
export const easing = {
  enter: [0.22, 1, 0.36, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export type MotionTier = keyof typeof motion;
