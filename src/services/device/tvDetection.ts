/**
 * Television detection.
 *
 * `Platform.isTV` (Android UI mode / tvOS idiom) is the first signal, but a
 * phone-build side-loaded onto an Android box often reports a normal UI mode
 * even though the box is driving a television. In that case the device name is
 * the fallback, so the app can pick the 10-foot layout by itself instead of
 * asking the viewer to switch by hand.
 *
 * Pure TypeScript on purpose: the rules are unit-tested without a renderer.
 */

export interface DeviceIdentity {
  /** `Platform.OS`. */
  platform: string;
  /** Android `uiMode` (`"tv"`, `"normal"`, …) or iOS `interfaceIdiom`. */
  uiMode?: string | null;
  /** `Platform.isTV`. */
  isTV?: boolean;
  brand?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

/** Device names that only ever belong to a television or a TV box. */
const TELEVISION_NAMES: RegExp[] = [
  /\b(android ?tv|google ?tv|apple ?tv|fire ?tv|smart ?tv|mi ?tv|bravia|chromecast|nexus player)\b/,
  /\bmi ?box\b/,
  /\bshield\b/,
  /\b(tv|android) ?box\b/,
  /\b(h96|x96|t95|a95x|tanix|mecool|formuler|zgemma|vontar|transpeed|dangbei|wechip|minix|seleuco)\b/,
];

/** Phones and tablets are never promoted by a name that happens to overlap. */
const HANDHELD_NAMES = /\b(tablet|phone|pad)\b/;

export function detectTelevision(device: DeviceIdentity): boolean {
  if (device.isTV) return true;

  const mode = (device.uiMode ?? "").trim().toLowerCase();
  if (mode === "tv") return true;
  if (device.platform !== "android") return false;

  const name = [device.brand, device.manufacturer, device.model]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase()
    .trim();
  if (!name) return false;
  if (HANDHELD_NAMES.test(name)) return false;

  return TELEVISION_NAMES.some((pattern) => pattern.test(name));
}

/** Human-readable device name for the Display settings screen. */
export function deviceLabel(device: DeviceIdentity): string {
  const name = [device.brand, device.model]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
  if (name) return name;
  if (device.platform === "ios") return "Apple device";
  if (device.platform === "android") return "Android device";
  return "This device";
}
