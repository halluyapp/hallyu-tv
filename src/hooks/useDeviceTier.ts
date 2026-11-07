import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Hardware-aware capability tier using actual physical RAM (`Device.totalMemory`)
 * so Android 13/14 Go devices with 2–3 GB RAM (e.g. TECNO Pop 8) and 1–2 GB
 * TV sticks get ultra-fast GPU-friendly rendering while 4 GB+ devices unlock
 * live backdrop blur and crossfades.
 */
export type DeviceTier = "low" | "standard" | "high";

export interface PerformanceProfile {
  tier: DeviceTier;
  isLowRam: boolean;
  /** Live BlurView enabled only on floating docks/modals when hardware has >= 3.5 GB RAM. */
  allowLiveBlur: boolean;
  listWindowSize: number;
  maxToRenderPerBatch: number;
  initialNumToRender: number;
  imageTransitionMs: number;
  totalMemoryBytes: number | null;
}

const GB = 1024 * 1024 * 1024;
let cachedProfile: PerformanceProfile | null = null;

export function evaluateDeviceTier(opts: {
  totalMemory?: number | null;
  platform?: string;
  androidVersion?: number | string;
}): DeviceTier {
  const mem = typeof opts.totalMemory === "number" && opts.totalMemory > 0 ? opts.totalMemory : null;
  if (mem !== null) {
    if (mem <= 3.25 * GB) return "low";
    if (mem >= 5.5 * GB) return "high";
    return "standard";
  }
  if (opts.platform === "android" && typeof opts.androidVersion === "number" && opts.androidVersion <= 28) {
    return "low";
  }
  return "standard";
}

function buildProfile(): PerformanceProfile {
  const totalMemory = typeof Device.totalMemory === "number" && Device.totalMemory > 0 ? Device.totalMemory : null;
  const tier = evaluateDeviceTier({
    totalMemory,
    platform: Platform.OS,
    androidVersion: Platform.Version,
  });
  const isLowRam = tier === "low";
  return {
    tier,
    isLowRam,
    allowLiveBlur: !isLowRam,
    listWindowSize: isLowRam ? 5 : 7,
    maxToRenderPerBatch: isLowRam ? 6 : 10,
    initialNumToRender: isLowRam ? 5 : 7,
    imageTransitionMs: isLowRam ? 0 : 80,
    totalMemoryBytes: totalMemory,
  };
}

export function getPerformanceProfile(): PerformanceProfile {
  if (cachedProfile === null) {
    cachedProfile = buildProfile();
  }
  return cachedProfile;
}

export function deviceTier(): "low" | "standard" {
  return getPerformanceProfile().isLowRam ? "low" : "standard";
}

export function useDeviceTier(): "low" | "standard" {
  return deviceTier();
}

export function usePerformanceProfile(): PerformanceProfile {
  return getPerformanceProfile();
}

export function canAffordAmbience(): boolean {
  return !getPerformanceProfile().isLowRam;
}
