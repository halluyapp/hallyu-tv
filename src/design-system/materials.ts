import { palette } from "./tokens";

/**
 * The liquid-glass material system.
 *
 * Six documented variants, each with a fixed purpose. A screen picks a variant;
 * it never invents its own opacity/border/shadow combination. That is what makes
 * the glass tunable centrally and keeps it consistent across 15 screens.
 *
 * Real blur is expensive. Each variant declares `blur`, and the device tier
 * decides whether it is honoured (`useEffects().blur`). When blur is off every
 * variant still renders correctly: the layered tint + luminous edge + inner
 * highlight carry the material on their own.
 */

export type MaterialName = "primary" | "secondary" | "elevated" | "focused" | "subtle" | "solid";

export interface Material {
  /** Base translucent fill. */
  fill: string;
  /** Second layer, painted above the base for internal depth. */
  innerFill: string | null;
  /** Hairline edge. */
  border: string;
  borderWidth: number;
  /** Luminous top-edge highlight (a 1px gradient strip, not a border). */
  highlight: readonly [string, string];
  /** Native blur radius, in points. 0 = no blur. */
  blur: number;
  /** Android blur method ("none" when blur is 0). */
  blurMethod: "none" | "dimezisBlurView";
  /** Elevation shadow. */
  shadow: { color: string; opacity: number; radius: number; offsetY: number; elevation: number } | null;
  radius: number;
  /** Where this material is allowed to be used. */
  use: string;
}

const glassShadow = { color: "#00040C", opacity: 0.55, radius: 28, offsetY: 14, elevation: 12 };

export const materials: Record<MaterialName, Material> = {
  /**
   * Floating navigation, hero information panels, the app's biggest surfaces.
   * The only material allowed to blur on the tab bar / player chrome.
   */
  primary: {
    fill: "rgba(26,40,68,0.62)",
    innerFill: palette.glassFill,
    border: palette.glassStrokeStrong,
    borderWidth: 1,
    highlight: ["rgba(210,235,255,0.42)", "rgba(210,235,255,0)"],
    blur: 26,
    blurMethod: "dimezisBlurView",
    shadow: glassShadow,
    radius: 28,
    use: "Tab bar, player chrome, hero info panel",
  },

  /** Smaller controls: pills, chips, icon buttons, shelf headers. */
  secondary: {
    fill: palette.glassFill,
    innerFill: null,
    border: palette.glassStroke,
    borderWidth: 1,
    highlight: ["rgba(200,228,255,0.22)", "rgba(200,228,255,0)"],
    blur: 0,
    blurMethod: "none",
    shadow: null,
    radius: 14,
    use: "Chips, pills, icon buttons, utility surfaces",
  },

  /** Dialogs, picker sheets, contextual overlays sitting above content. */
  elevated: {
    fill: "rgba(12,20,36,0.90)",
    innerFill: "rgba(120,170,255,0.05)",
    border: palette.glassStrokeStrong,
    borderWidth: 1,
    highlight: ["rgba(210,235,255,0.34)", "rgba(210,235,255,0)"],
    blur: 18,
    blurMethod: "dimezisBlurView",
    shadow: { color: "#00040C", opacity: 0.7, radius: 36, offsetY: 18, elevation: 20 },
    radius: 28,
    use: "Sheets, dialogs, menus",
  },

  /** TV focus state — a blue edge light, never a colour flood. */
  focused: {
    fill: "rgba(61,123,255,0.14)",
    innerFill: "rgba(111,227,255,0.08)",
    border: palette.accentBright,
    borderWidth: 2,
    highlight: ["rgba(150,230,255,0.75)", "rgba(150,230,255,0)"],
    blur: 0,
    blurMethod: "none",
    shadow: { color: palette.accent, opacity: 0.45, radius: 26, offsetY: 0, elevation: 16 },
    radius: 20,
    use: "Focused TV tile / selected control",
  },

  /** Low-priority separators and inert surfaces. */
  subtle: {
    fill: "rgba(120,170,255,0.03)",
    innerFill: null,
    border: "rgba(150,195,255,0.09)",
    borderWidth: 1,
    highlight: ["rgba(200,228,255,0.10)", "rgba(200,228,255,0)"],
    blur: 0,
    blurMethod: "none",
    shadow: null,
    radius: 12,
    use: "Separators, low-priority containers",
  },

  /** Opaque fallback: content that must stay readable over bright artwork. */
  solid: {
    fill: palette.surface,
    innerFill: null,
    border: "rgba(150,195,255,0.10)",
    borderWidth: 1,
    highlight: ["rgba(200,228,255,0.12)", "rgba(200,228,255,0)"],
    blur: 0,
    blurMethod: "none",
    shadow: null,
    radius: 20,
    use: "Text-heavy panels over unpredictable artwork",
  },
};

/** Linear-gradient stops used for every ambient surface. */
export const ambientGradient = {
  page: ["#03050B", "#050810", "#070C18"] as const,
  heroTop: ["rgba(3,5,11,0)", "rgba(3,5,11,0.35)", "rgba(3,5,11,0.88)", "rgba(3,5,11,1)"] as const,
  heroLocations: [0, 0.42, 0.78, 1] as const,
  /** Diagonal light sweep across a glass panel. */
  sheen: ["rgba(190,225,255,0.16)", "rgba(190,225,255,0.02)", "rgba(190,225,255,0)"] as const,
  accentButton: ["#6FA0FF", "#3D7BFF", "#2A5BE0"] as const,
  cyanEdge: ["rgba(111,227,255,0.55)", "rgba(61,123,255,0.15)", "rgba(61,123,255,0)"] as const,
};
