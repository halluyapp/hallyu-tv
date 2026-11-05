import Constants from "expo-constants";
import { Platform } from "react-native";

export type AppVariant = "mobile" | "tv";

/**
 * Determine the app variant at build/run time.
 * Priority:
 * 1. process.env.EXPO_PUBLIC_APP_VARIANT (inlined at bundle compile time by Metro)
 * 2. Constants.expoConfig?.extra?.appVariant (injected at prebuild time by app.config.js)
 * 3. Platform.isTV fallback for local development
 */
export function getAppVariant(): AppVariant {
  const envVariant = process.env.EXPO_PUBLIC_APP_VARIANT;
  if (envVariant === "tv" || envVariant === "mobile") {
    return envVariant;
  }
  const extraVariant = Constants.expoConfig?.extra?.appVariant as AppVariant | undefined;
  if (extraVariant === "tv" || extraVariant === "mobile") {
    return extraVariant;
  }
  return Platform.isTV ? "tv" : "mobile";
}

export function getVariantPackageName(variant: AppVariant): string {
  return variant === "tv" ? "app.hallyutv.dev" : "app.hallyu.mobile";
}

export function getVariantAppName(variant: AppVariant): string {
  return variant === "tv" ? "Hallyu TV" : "Hallyu Mobile";
}

export function getVariantShortBrand(variant: AppVariant): string {
  return variant === "tv" ? "Hallyu TV" : "Hallyu";
}

export const APP_VARIANT = getAppVariant();
export const IS_TV = APP_VARIANT === "tv";
export const IS_MOBILE = APP_VARIANT === "mobile";

export function isTvVariant(): boolean {
  return getAppVariant() === "tv";
}

export function isMobileVariant(): boolean {
  return getAppVariant() === "mobile";
}
