/**
 * Expo config plugin: make the generated Android manifest launchable on
 * Android TV without requiring a touchscreen. The app remains a normal
 * phone/tablet app; TV devices get the independent TV navigator in JS.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

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

  const application = root.application?.[0];
  const activities = application?.activity ?? [];
  for (const activity of activities) {
    const filters = activity["intent-filter"] ?? [];
    const isLauncher = filters.some((filter) =>
      (filter.action ?? []).some((action) => action.$?.["android:name"] === "android.intent.action.MAIN") &&
      (filter.category ?? []).some((category) => category.$?.["android:name"] === "android.intent.category.LAUNCHER"),
    );
    if (!isLauncher) continue;
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

const withAndroidTvSupport = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = patchManifest(config.modResults);
    return config;
  });

module.exports = withAndroidTvSupport;
module.exports.patchManifest = patchManifest;
