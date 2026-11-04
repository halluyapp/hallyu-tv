import { Platform } from "react-native";

/**
 * Rough device capability tier, measured from the platform (never invented).
 * Android version is the honest cross-device signal available without extra
 * native modules: OS releases before Android 8.1 (API 27) correlate strongly
 * with low-memory hardware. "low" tier gets static decoration instead of
 * looping ambience and trimmed list windows. TVs always report "standard":
 * they have headroom and the big screen deserves the show.
 */
export type DeviceTier = "low" | "standard";

let cached: DeviceTier | null = null;

function detect(): DeviceTier {
  if (Platform.isTV) return "standard";
  if (Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version <= 26) return "low";
  return "standard";
}

export function deviceTier(): DeviceTier {
  if (cached === null) cached = detect();
  return cached;
}

export function useDeviceTier(): DeviceTier {
  return deviceTier();
}

/** True when looping ambient motion is appropriate on this device. */
export function canAffordAmbience(): boolean {
  return deviceTier() === "standard";
}
