/**
 * Expo config plugin: make the generated Android manifest launchable on
 * Android TV without requiring a touchscreen, and give the leanback launcher a
 * proper wide banner instead of a square phone icon.
 *
 * The app remains a normal phone/tablet app; TV devices get the independent TV
 * navigator in JS.
 *
 * Note: Expo does not materialise `android.tvBanner` into `res/drawable` by
 * itself, so this plugin copies the configured banner in and only references a
 * drawable it actually created. Referencing a non-existent drawable is a build
 * error, not a cosmetic issue.
 */
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BANNER_DRAWABLE = "tv_banner";

function addUsesFeature(manifest, name, required) {
  manifest["uses-feature"] = manifest["uses-feature"] ?? [];
  const existing = manifest["uses-feature"].find((f) => f.$?.["android:name"] === name);
  if (existing) {
    existing.$["android:required"] = String(required);
  } else {
    manifest["uses-feature"].push({ $: { "android:name": name, "android:required": String(required) } });
  }
}

function patchManifest(manifest, options = {}) {
  const root = manifest.manifest;
  addUsesFeature(root, "android.software.leanback", false);
  addUsesFeature(root, "android.hardware.touchscreen", false);

  const application = root.application?.[0];
  if (application && options.banner) {
    application.$ = application.$ ?? {};
    application.$["android:banner"] = options.banner;
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

/** Copy the configured banner into res/drawable so the manifest reference resolves. */
function copyBanner(config) {
  const bannerPath = config.android?.tvBanner;
  if (!bannerPath) return null;
  const projectRoot = config.modRequest?.projectRoot ?? config._internal?.projectRoot ?? process.cwd();
  const source = path.resolve(projectRoot, bannerPath);
  if (!fs.existsSync(source)) {
    throw new Error(`[withAndroidTvSupport] TV banner not found: ${source}`);
  }
  const drawableDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable");
  fs.mkdirSync(drawableDir, { recursive: true });
  const target = path.join(drawableDir, `${BANNER_DRAWABLE}.png`);
  fs.copyFileSync(source, target);
  return target;
}

const withAndroidTvSupport = (config) => {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      copyBanner(cfg);
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const hasBanner = Boolean(cfg.android?.tvBanner);
    cfg.modResults = patchManifest(cfg.modResults, {
      banner: hasBanner ? `@drawable/${BANNER_DRAWABLE}` : undefined,
    });
    return cfg;
  });
};

module.exports = withAndroidTvSupport;
module.exports.patchManifest = patchManifest;
module.exports.BANNER_DRAWABLE = BANNER_DRAWABLE;
