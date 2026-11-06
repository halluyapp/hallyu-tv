import React from "react";
import { Platform } from "react-native";
import { isTvVariant } from "@/config/appVariant";

/**
 * Clean Dual-App Root Router with Compile-Time Dead-Code Elimination:
 * - Static `if / else if` on `process.env.EXPO_PUBLIC_APP_VARIANT` lets Metro's
 *   terser/Hermes dead-branch stripper eliminate the entire unused app variant
 *   from each release bundle (`hallyu-mobile.apk` vs `hallyu-tv.apk`).
 */
export default function App() {
  if (process.env.EXPO_PUBLIC_APP_VARIANT === "tv") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TvApp } = require("@/apps/tv/TvApp") as typeof import("@/apps/tv/TvApp");
    return <TvApp />;
  } else if (process.env.EXPO_PUBLIC_APP_VARIANT === "mobile") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MobileApp } = require("@/apps/mobile/MobileApp") as typeof import("@/apps/mobile/MobileApp");
    return <MobileApp />;
  } else if (isTvVariant() || Platform.isTV) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TvApp } = require("@/apps/tv/TvApp") as typeof import("@/apps/tv/TvApp");
    return <TvApp />;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MobileApp } = require("@/apps/mobile/MobileApp") as typeof import("@/apps/mobile/MobileApp");
    return <MobileApp />;
  }
}
