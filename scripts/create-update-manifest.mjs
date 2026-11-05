import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const variant = process.env.APP_VARIANT;
if (variant !== "mobile" && variant !== "tv") throw new Error("APP_VARIANT must be mobile or tv");
const apkPath = process.argv[2];
if (!apkPath) throw new Error("Usage: APP_VARIANT=mobile|tv node scripts/create-update-manifest.mjs path/to/app.apk");
const expectedPackage = variant === "tv" ? "app.hallyutv.dev" : "app.hallyu.mobile";
const config = await import(path.resolve("app.config.js"));
const appJson = JSON.parse(await readFile("app.json", "utf8"));
const expo = config.default ? config.default({ config: appJson.expo }) : config({ config: appJson.expo });
const apk = await readFile(apkPath);
const info = await stat(apkPath);
const version = (process.env.APP_VERSION || expo.version).replace(/^v/, "");
const versionCode = expo.android.versionCode;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error(`Invalid versionCode: ${versionCode}`);
const releaseNotes = process.env.RELEASE_NOTES || "See the release notes on GitHub.";
const manifest = {
  variant,
  version,
  versionCode,
  packageName: expectedPackage,
  apkAssetName: `hallyu-${variant}.apk`,
  sha256: createHash("sha256").update(apk).digest("hex"),
  fileSize: info.size,
  releaseNotes,
};
await writeFile(`${variant}-update.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${variant}-update.json for ${expectedPackage} v${version} (${info.size} bytes)`);
