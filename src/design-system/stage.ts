/**
 * Stage — the single spatial system for Hallyu TV.
 *
 * Nothing in a screen may hard-code a pixel size any more. Every dimension
 * comes from here, derived from the real viewport and the display tier, so the
 * same screen is intentional on a 5" phone, a 12" tablet, a 27" monitor and a
 * 55" television driven by an Android box.
 *
 * Tiers:
 *   compact  — phones. The densest, closest reading distance.
 *   regular  — tablets, laptops, monitors. More air, bigger type.
 *   stage    — the 10-foot tier: television, TV-mode override, or any very
 *              large viewport. Type, targets and gutters scale for a remote.
 *
 * `remote` is separate from `tier` on purpose: a monitor is a "stage" to look
 * at, but it is still driven by a mouse, not a d-pad.
 *
 * This module is pure TypeScript (no react-native import) so layout rules are
 * unit-testable without a renderer.
 */

export type StageTier = "compact" | "regular" | "stage";
export type DisplayMode = "auto" | "tv" | "tablet";

export interface Stage {
  tier: StageTier;
  mode: DisplayMode;
  /** True when the interface is driven by a remote at ~10 feet. */
  remote: boolean;
  width: number;
  height: number;
  /** Base unit: ~1% of the shortest viewport side, clamped to sane bounds. */
  u: number;
  /** Outer page gutter. */
  gutter: number;
  /** Vertical distance between rails. */
  rowGap: number;
  /** Distance between cards in a rail. */
  cardGap: number;
  posterWidth: number;
  posterHeight: number;
  heroHeight: number;
  /** Detail-page title. */
  titleSize: number;
  heroTitleSize: number;
  railTitleSize: number;
  cardTitleSize: number;
  metaSize: number;
  bodySize: number;
  subtitleSize: number;
  /** Keyboard/remote focus rim thickness. */
  focusRing: number;
  /** Minimum square target for buttons and spine keys. */
  controlSize: number;
  spineWidth: number;
  playerButton: number;
}

const POSTER_RATIO = 1.5;

function px(n: number): number {
  return Math.max(0, Math.round(n));
}

/**
 * Decide the tier from the real viewport, the platform TV flag and the user's
 * display-mode override. `Platform.isTV` is unreliable on Android boxes (a box
 * outputting 1080p can report a non-TV UI mode), so it is one signal among
 * three — never the only one.
 */
export function resolveTier(
  width: number,
  height: number,
  isTv: boolean,
  mode: DisplayMode = "auto",
): StageTier {
  if (mode === "tv") return "stage";
  if (mode === "tablet") return "regular";
  if (isTv) return "stage";
  const shortest = Math.min(width, height);
  if (shortest >= 860) return "stage";
  if (width >= 600) return "regular";
  return "compact";
}

export function stageMetrics(
  width: number,
  height: number,
  tier: StageTier,
  remote: boolean,
  mode: DisplayMode = "auto",
): Stage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const shortest = Math.min(w, h);
  const u = Math.max(3.6, Math.min(14, shortest / 100));

  if (tier === "stage") {
    // ~6 cards visible across a 1080p panel; the focused card can grow into
    // the gap without colliding with its neighbour.
    const posterWidth = px(w * 0.164);
    return {
      tier,
      mode,
      remote,
      width: w,
      height: h,
      u: Math.round(u * 100) / 100,
      gutter: px(u * 4.4),
      rowGap: px(u * 3.6),
      cardGap: px(u * 2.6),
      posterWidth,
      posterHeight: px(posterWidth * POSTER_RATIO),
      heroHeight: Math.round(Math.min(Math.max(h * 0.6, 300), 640)),
      titleSize: px(u * 5.6),
      heroTitleSize: px(u * 7.2),
      railTitleSize: px(u * 2.9),
      cardTitleSize: px(u * 2.5),
      metaSize: px(u * 2.1),
      bodySize: px(u * 2.6),
      subtitleSize: px(u * 3.6),
      focusRing: Math.max(2, px(u * 0.5)),
      controlSize: px(u * 10),
      spineWidth: Math.round(Math.min(240, Math.max(180, u * 32))),
      playerButton: px(u * 16),
    };
  }

  if (tier === "regular") {
    const gutter = px(u * 3);
    const cardGap = px(u * 1.6);
    const posterWidth = px((w - gutter * 2 - cardGap * 3) / 4.6);
    return {
      tier,
      mode,
      remote,
      width: w,
      height: h,
      u: Math.round(u * 100) / 100,
      gutter,
      rowGap: px(u * 3.4),
      cardGap,
      posterWidth,
      posterHeight: px(posterWidth * POSTER_RATIO),
      heroHeight: Math.round(Math.min(h * 0.54, 560)),
      titleSize: px(u * 4.6),
      heroTitleSize: px(u * 5.4),
      railTitleSize: px(u * 2.6),
      cardTitleSize: px(u * 2),
      metaSize: px(u * 1.6),
      bodySize: px(u * 2.1),
      subtitleSize: px(u * 2.7),
      focusRing: 2,
      controlSize: px(u * 6.8),
      spineWidth: 0,
      playerButton: px(u * 11),
    };
  }

  // compact — phones
  const gutter = 24;
  const cardGap = 12;
  const posterWidth = px((w - gutter * 2 - cardGap * 2) / 3);
  return {
    tier,
    mode,
    remote,
    width: w,
    height: h,
    u: Math.round(u * 100) / 100,
    gutter,
    rowGap: 26,
    cardGap,
    posterWidth,
    posterHeight: px(posterWidth * POSTER_RATIO),
    heroHeight: Math.round(Math.min(h * 0.56, 430)),
    titleSize: 32,
    heroTitleSize: 30,
    railTitleSize: 17,
    cardTitleSize: 13,
    metaSize: 11,
    bodySize: 15,
    subtitleSize: 17,
    focusRing: 2,
    controlSize: 44,
    spineWidth: 0,
    playerButton: 72,
  };
}
