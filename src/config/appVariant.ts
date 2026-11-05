import Constants from "expo-constants";
import { Platform } from "react-native";

export type AppVariant = "mobile" | "tv";

/**
 * Determine the app variant at build/run time.
 * Priority:
 * 1. Constants.expoConfig?.extra?.appVariant (injected at build time by app.config.js)
 * 2. process.env.EXPO_PUBLIC_APP_VARIANT
 * 3. Platform.isTV fallback for development
 */
export function getAppVariant(): AppVariant {
  const extraVariant = Constants.expoConfig?.extra?.appVariant as AppVariant | undefined;
  if (extraVariant === "tv" || extraVariant === "mobile") {
    return extraVariant;
  }
  const envVariant = process.env.EXPO_PUBLIC_APP_VARIANT;
  if (envVariant === "tv" || envVariant === "mobile") {
    return envVariant;
  }
  return Platform.isTV ? "tv" : "mobile";
}

export function getVariantPackageName(variant: AppVariant): string {
  return variant === "tv" ? "app.hallyutv.dev" : "app.hallyu.mobile";
}

export function getVariantAppName(variant: AppVariant): string {
  return variant === "tv" ? "Hallyu TV" : "Hallyu Mobile";
}

export const APP_VARIANT = getAppVariant();
export const IS_TV = APP_VARIANT === "tv";
export const IS_MOBILE = APP_VARIANT === "mobile";
