import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const variant = process.env.APP_VARIANT;
if (variant !== "mobile" && variant !== "tv") {
  throw new Error("APP_VARIANT must be mobile or tv");
}
const apkPath = process.argv[2];
if (!apkPath) {
  throw new Error("Usage: APP_VARIANT=mobile|tv node scripts/create-update-manifest.mjs path/to/app.apk");
}

const expectedPackage = variant === "tv" ? "app.hallyutv.dev" : "app.hallyu.mobile";
const repo = process.env.GITHUB_REPOSITORY || "halluyapp/hallyu-tv";
const config = await import(path.resolve("app.config.js"));
const appJson = JSON.parse(await readFile("app.json", "utf8"));
const expo = config.default ? config.default({ config: appJson.expo }) : config({ config: appJson.expo });

const apk = await readFile(apkPath);
const info = await stat(apkPath);
const rawTag = process.env.RELEASE_TAG || process.env.APP_VERSION || expo.version;
const version = String(rawTag).replace(/^v/, "");
const versionCode = expo.android.versionCode;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid release version: ${version}`);
}
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error(`Invalid versionCode: ${versionCode}`);
}

const apkAssetName = `hallyu-${variant}.apk`;
const sha256 = createHash("sha256").update(apk).digest("hex");
const releaseNotes = (process.env.RELEASE_NOTES || "").trim() || `Hallyu ${variant === "tv" ? "TV" : "Mobile"} v${version} Liquid Glass release.`;
const tagSegment = process.env.RELEASE_TAG ? `download/${process.env.RELEASE_TAG}` : "latest/download";
const apkUrl = `https://github.com/${repo}/releases/${tagSegment}/${apkAssetName}`;

const manifest = {
  variant,
  version,
  versionCode,
  packageName: expectedPackage,
  minimumSupportedVersionCode: 1,
  apkAssetName,
  apkUrl,
  sha256,
  fileSize: info.size,
  publishedAt: new Date().toISOString(),
  releaseNotes,
};

const outDir = process.env.OUT_DIR || ".";
await writeFile(path.join(outDir, `${variant}-update.json`), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(outDir, `${variant}-sha256.txt`), `${sha256}  ${apkAssetName}\n`);
console.log(`Created ${variant}-update.json for ${expectedPackage} v${version} (${info.size} bytes, sha256=${sha256})`);
