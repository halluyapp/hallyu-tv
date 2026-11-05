/**
 * Expo config plugin: configure Android TV Leanback launcher, non-touchscreen
 * hardware declarations, and the 320x180 Android TV home-screen banner drawable.
 */
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function addUsesFeature(manifest, name, required) {
  manifest["uses-feature"] = manifest["uses-feature"] ?? [];
  const existing = manifest["uses-feature"].find((f) => f.$?.["android:name"] === name);
  if (existing) {
    existing.$["android:required"] = String(required);
  } else {
    manifest["uses-feature"].push({ $: { "android:name": name, "android:required": String(required) } });
  }
}

function patchManifest(manifest) {
  const root = manifest.manifest;
  addUsesFeature(root, "android.software.leanback", false);
  addUsesFeature(root, "android.hardware.touchscreen", false);
  addUsesFeature(root, "android.hardware.faketouch", false);

  const application = root.application?.[0];
  if (application) {
    application.$ = application.$ ?? {};
    application.$["android:banner"] = "@drawable/tv_banner";
  }

  const activities = application?.activity ?? [];
  for (const activity of activities) {
    const filters = activity["intent-filter"] ?? [];
    const isLauncher = filters.some(
      (filter) =>
        (filter.action ?? []).some((action) => action.$?.["android:name"] === "android.intent.action.MAIN") &&
        (filter.category ?? []).some((category) => category.$?.["android:name"] === "android.intent.category.LAUNCHER"),
    );
    if (!isLauncher) continue;
    activity.$ = activity.$ ?? {};
    activity.$["android:configChanges"] =
      activity.$["android:configChanges"] ||
      "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize";
    for (const filter of filters) {
      const actions = filter.action ?? [];
      if (!actions.some((action) => action.$?.["android:name"] === "android.intent.action.MAIN")) continue;
      filter.category = filter.category ?? [];
      if (!filter.category.some((category) => category.$?.["android:name"] === "android.intent.category.LEANBACK_LAUNCHER")) {
        filter.category.push({ $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" } });
      }
    }
  }
  return manifest;
}

function copyTvBanner(projectRoot) {
  const srcBanner = path.join(projectRoot, "assets", "images", "tv-banner.png");
  if (!fs.existsSync(srcBanner)) return;
  const xhdpiDir = path.join(projectRoot, "android", "app", "src", "main", "res", "drawable-xhdpi");
  const drawableDir = path.join(projectRoot, "android", "app", "src", "main", "res", "drawable");
  fs.mkdirSync(xhdpiDir, { recursive: true });
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.copyFileSync(srcBanner, path.join(xhdpiDir, "tv_banner.png"));
  fs.copyFileSync(srcBanner, path.join(drawableDir, "tv_banner.png"));
}

const withAndroidTvSupport = (config) => {
  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = patchManifest(modConfig.modResults);
    return modConfig;
  });
  config = withDangerousMod(config, [
    "android",
    (modConfig) => {
      copyTvBanner(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
  return config;
};

module.exports = withAndroidTvSupport;
module.exports.patchManifest = patchManifest;
module.exports.copyTvBanner = copyTvBanner;
