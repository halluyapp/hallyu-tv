/**
 * "Liquid Cinema" motion vocabulary — the single timing language.
 *
 * Tiers:
 *   instant  120 — press feedback, focus settle
 *   fast     180 — chip selects, small reveals
 *   normal   260 — routine screen transitions, sheets
 *   slow     420 — hero crossfades, panel materialisation
 *   cinematic 680 — the rare opening flourish only
 *
 * Nothing in primary navigation may exceed `slow`. Motion is always an
 * enhancement: every consumer checks reduced-motion and the device tier first.
 */
export const motion = {
  instant: 120,
  fast: 180,
  normal: 260,
  slow: 420,
  cinematic: 680,
} as const;

export type MotionTier = keyof typeof motion;

/**
 * Cubic-bezier control points. Kept as plain numbers so this module has no
 * React Native runtime dependency (it is imported by unit tests): consumers wrap
 * them with `Easing.bezier(...)` from react-native.
 */
export const easing = {
  /** Decelerate into place — the default for anything appearing. */
  enter: [0.22, 1, 0.36, 1] as const,
  /** Accelerate away — dismissals. */
  exit: [0.4, 0, 1, 1] as const,
};

/** Scale constants — TV focus must stay comfortable, never bouncy. */
export const scale = {
  pressMobile: 0.97,
  pressTv: 1,
  focusTv: 1.06,
  focusTvMax: 1.08,
  posterLift: 1.03,
  sheetFrom: 0.96,
} as const;

/** Spring presets for RN Animated (native driver compatible). */
export const springs = {
  press: { speed: 40, bounciness: 0 },
  release: { speed: 26, bounciness: 4 },
  focus: { speed: 18, bounciness: 6 },
  sheet: { speed: 16, bounciness: 2 },
} as const;

/** Stagger between list items appearing (ms). 0 when motion is reduced. */
export const STAGGER_MS = 35;
/** How long player chrome stays visible without interaction. */
export const CONTROLS_IDLE_MS = 3200;
/** Idle timeout on TV is longer: the user is holding a remote, not tapping. */
export const CONTROLS_IDLE_TV_MS = 5000;
