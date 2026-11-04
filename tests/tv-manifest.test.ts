import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { patchManifest } = require("../plugins/withAndroidTvSupport.js") as {
  patchManifest: (manifest: any) => any;
};

function baseManifest() {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      application: [
        {
          activity: [
            {
              $: { "android:name": ".MainActivity" },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                  category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe("Android TV manifest support", () => {
  test("adds leanback launcher without removing the phone launcher", () => {
    const patched = patchManifest(baseManifest());
    const categories = patched.manifest.application[0].activity[0]["intent-filter"][0].category.map((c: any) => c.$["android:name"]);
    expect(categories).toContain("android.intent.category.LAUNCHER");
    expect(categories).toContain("android.intent.category.LEANBACK_LAUNCHER");
  });

  test("does not require touchscreen or leanback hardware", () => {
    const patched = patchManifest(baseManifest());
    const features = patched.manifest["uses-feature"];
    const touch = features.find((f: any) => f.$["android:name"] === "android.hardware.touchscreen");
    const leanback = features.find((f: any) => f.$["android:name"] === "android.software.leanback");
    expect(touch.$["android:required"]).toBe("false");
    expect(leanback.$["android:required"]).toBe("false");
  });

  test("is idempotent", () => {
    const once = patchManifest(baseManifest());
    const twice = patchManifest(once);
    const categories = twice.manifest.application[0].activity[0]["intent-filter"][0].category;
    expect(categories.filter((c: any) => c.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER")).toHaveLength(1);
  });

  test("app config registers the TV and downloader plugins only", () => {
    const appJson = JSON.parse(readFileSync(join(import.meta.dir, "..", "app.json"), "utf8"));
    // Plugin identity is the contract: exactly these three, in order. The
    // expo-video entry may carry config props (PiP / background playback).
    const names = appJson.expo.plugins.map((p: string | [string, unknown]) => (Array.isArray(p) ? p[0] : p));
    expect(names).toEqual(["expo-video", "./plugins/withHallyuDownloader", "./plugins/withAndroidTvSupport"]);
    const videoEntry = appJson.expo.plugins.find((p: unknown) => Array.isArray(p));
    expect(videoEntry?.[1]?.supportsPictureInPicture).toBe(true);
    expect(appJson.expo.android.permissions).not.toContain("android.permission.CAMERA");
  });
});
