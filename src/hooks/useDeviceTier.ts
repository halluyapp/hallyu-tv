import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Capability tiers — measured from the device, not guessed from the OS version.
 *
 * `Platform.Version` is deliberately NOT the primary signal: a 2020 phone on
 * Android 13 with 2 GB of RAM is a low-capability device, and an Android 9 TV
 * box with 3 GB may be perfectly comfortable. We read real total memory and
 * core count from `expo-device` (available offline, no permissions), then fall
 * back to conservative defaults when a signal is unavailable.
 *
 *   high      — 6 GB+ RAM: real blur, parallax, richer motion
 *   standard  — 3–6 GB: blur on the 4 high-value surfaces only, moderate motion
 *   low       — under 3 GB or unknown-and-old: no blur, static decoration,
 *               trimmed list windows. The visual identity is preserved; only
 *               the cost is reduced.
 */

export type DeviceTier = "low" | "standard" | "high";

export interface Effects {
  tier: DeviceTier;
  /** True when live blur is affordable at all. */
  blur: boolean;
  /** Max simultaneous blurred surfaces we allow to exist. */
  blurSurfaces: number;
  /** Looping ambient glows / shimmer loops. */
  ambience: boolean;
  /** Poster lift / parallax transforms on scroll. */
  parallax: boolean;
  /** Full-quality artwork decode; false requests a downsampled decode. */
  fullQualityImages: boolean;
  /** FlatList tuning. */
  listWindow: number;
  listInitial: number;
  listBatch: number;
}

let cached: Effects | null = null;

function readMegabytes(): number | null {
  const raw = Device.totalMemory;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw / (1024 * 1024));
}

function readCores(): number | null {
  const raw = Device.supportedCpuArchitectures?.length;
  return typeof raw === "number" && raw > 0 ? raw : null;
}

function detectTier(): DeviceTier {
  const mb = readMegabytes();
  const cores = readCores();

  // Unknown memory: be conservative rather than optimistic. A low-end phone
  // that drops frames is a much worse experience than a flagship without blur.
  if (mb === null) {
    if (Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version <= 27) return "low";
    return coreTier(cores) ?? "standard";
  }
  if (mb < 2800) return "low";
  if (mb < 5800) return "standard";
  // Lots of RAM but a genuinely slow CPU still shouldn't get full fancy.
  if (cores !== null && cores <= 4) return "standard";
  return "high";
}

function coreTier(cores: number | null): DeviceTier | null {
  if (cores === null) return null;
  if (cores <= 2) return "low";
  if (cores <= 4) return "standard";
  return "high";
}

function buildEffects(tier: DeviceTier): Effects {
  switch (tier) {
    case "high":
      return {
        tier,
        blur: true,
        blurSurfaces: 4,
        ambience: true,
        parallax: true,
        fullQualityImages: true,
        listWindow: 7,
        listInitial: 8,
        listBatch: 12,
      };
    case "standard":
      return {
        tier,
        blur: true,
        blurSurfaces: 2,
        ambience: true,
        parallax: false,
        fullQualityImages: true,
        listWindow: 5,
        listInitial: 6,
        listBatch: 10,
      };
    case "low":
    default:
      return {
        tier: "low",
        blur: false,
        blurSurfaces: 0,
        ambience: false,
        parallax: false,
        fullQualityImages: false,
        listWindow: 3,
        listInitial: 4,
        listBatch: 6,
      };
  }
}

/** Cached effect budget for this device. Safe to call anywhere, any number of times. */
export function effects(): Effects {
  if (cached === null) {
    try {
      cached = buildEffects(detectTier());
    } catch {
      // A native module failure must never take the app down.
      cached = buildEffects("standard");
    }
  }
  return cached;
}

export function deviceTier(): DeviceTier {
  return effects().tier;
}

/** True when looping ambient motion is appropriate on this device. */
export function canAffordAmbience(): boolean {
  return effects().ambience;
}

/** True when live blur is affordable. Callers must still respect the cap. */
export function canAffordBlur(): boolean {
  return effects().blur;
}

/** Test seam: reset the cache (used by unit tests, never by screens). */
export function resetDeviceTierCache(): void {
  cached = null;
}
