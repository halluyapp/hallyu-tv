import React from "react";
import { Platform } from "react-native";
import { isTvVariant } from "@/config/appVariant";

/**
 * Clean Dual-App Root Router with Zero-Heap Lazy Variant Loading:
 * - `HALLYU_VARIANT=tv` (`app.hallyutv.dev`) or Android TV Leanback -> loads ONLY `TvApp` into JS heap
 * - `HALLYU_VARIANT=mobile` (`app.hallyu.mobile`) -> loads ONLY `MobileApp` into JS heap (protecting 2 GB RAM phones)
 */
export default function App() {
  if (isTvVariant() || Platform.isTV) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TvApp } = require("@/apps/tv/TvApp") as typeof import("@/apps/tv/TvApp");
    return <TvApp />;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MobileApp } = require("@/apps/mobile/MobileApp") as typeof import("@/apps/mobile/MobileApp");
  return <MobileApp />;
}
