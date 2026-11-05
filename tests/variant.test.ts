import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isNewerVersion, parseSemver } from "../src/services/updater/version";

const ROOT = join(import.meta.dir, "..");
const getConfig = require("../app.config.js");
const baseConfig = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;

describe("Dual-App Target Configuration", () => {
  test("Mobile variant configures touch package, portrait orientation, and standard launcher", () => {
    process.env.APP_VARIANT = "mobile";
    const config = getConfig({ config: baseConfig });
    expect(config.name).toBe("Hallyu Mobile");
    expect(config.slug).toBe("hallyu-mobile");
    expect(config.android.package).toBe("app.hallyu.mobile");
    expect(config.orientation).toBe("portrait");
    expect(config.extra.appVariant).toBe("mobile");
    // Mobile must NOT include Android TV leanback launcher plugin
    const plugins = config.plugins.map((p: any) => (Array.isArray(p) ? p[0] : p));
    expect(plugins).toContain("./plugins/withHallyuDownloader");
    expect(plugins).not.toContain("./plugins/withAndroidTvSupport");
  });

  test("TV variant configures TV package, landscape orientation, and leanback launcher", () => {
    process.env.APP_VARIANT = "tv";
    const config = getConfig({ config: baseConfig });
    expect(config.name).toBe("Hallyu TV");
    expect(config.slug).toBe("hallyu-tv");
    expect(config.android.package).toBe("app.hallyutv.dev");
    expect(config.orientation).toBe("landscape");
    expect(config.extra.appVariant).toBe("tv");
    // TV must include Android TV leanback launcher plugin
    const plugins = config.plugins.map((p: any) => (Array.isArray(p) ? p[0] : p));
    expect(plugins).toContain("./plugins/withAndroidTvSupport");
    expect(plugins).toContain("./plugins/withHallyuDownloader");
  });

  test("Mobile and TV package IDs are distinct for side-by-side installation", () => {
    process.env.APP_VARIANT = "mobile";
    const mobile = getConfig({ config: baseConfig });
    process.env.APP_VARIANT = "tv";
    const tv = getConfig({ config: baseConfig });
    expect(mobile.android.package).not.toBe(tv.android.package);
    expect(mobile.android.package).toBe("app.hallyu.mobile");
    expect(tv.android.package).toBe("app.hallyutv.dev");
  });

  test("Obsolete auth and pairing files are completely deleted", () => {
    expect(existsSync(join(ROOT, "src/services/auth"))).toBe(false);
    expect(existsSync(join(ROOT, "src/components/ui/GoogleSignInButton.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "src/screens/tv/TvPairingScreen.tsx"))).toBe(false);
  });

  test("Updater semver comparison correctly evaluates upgrades", () => {
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
  });
});
