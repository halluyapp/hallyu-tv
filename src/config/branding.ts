import Constants from "expo-constants";
import { APP_VARIANT, getVariantAppName, getVariantPackageName, getVariantShortBrand } from "./appVariant";

/**
 * Variant-aware Hallyu brand identity.
 * Hallyu Mobile (`app.hallyu.mobile`) and Hallyu TV (`app.hallyutv.dev`) share
 * the Hallyu Liquid Glass visual identity while keeping distinct product names.
 */
export const APP_NAME = getVariantAppName(APP_VARIANT);
export const BRAND_SHORT_NAME = getVariantShortBrand(APP_VARIANT);
export const BRAND_WORDMARK = "HALLYU";
export const PACKAGE_NAME = getVariantPackageName(APP_VARIANT);
export const APP_TAGLINE = "Asia's cinema & dramas, in Liquid Glass.";
export const APP_VERSION = Constants.expoConfig?.version ?? "0.1.0";
export const IS_TEMPORARY_BRAND = false;
