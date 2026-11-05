import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";
import { getAppVariant, getVariantPackageName, type AppVariant } from "@/config/appVariant";
import { isNewerVersion, parseSemver, stripFileScheme } from "./version";

export { isNewerVersion, parseSemver, stripFileScheme };

export interface ReleaseManifest {
  variant: AppVariant;
  version: string;
  versionCode: number;
  packageName: string;
  minimumSupportedVersionCode?: number;
  apkAssetName: string;
  sha256: string;
  fileSize: number;
  publishedAt?: string;
  releaseNotes: string;
  apkUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  currentVersionCode: number;
  currentVariant: AppVariant;
  manifest: ReleaseManifest | null;
  error?: string;
}

export interface InstallUpdateResult {
  success: boolean;
  needsPermission?: boolean;
  error?: string;
}

interface ManifestFile {
  variant?: unknown;
  version?: unknown;
  versionCode?: unknown;
  packageName?: unknown;
  minimumSupportedVersionCode?: unknown;
  apkAssetName?: unknown;
  apkUrl?: unknown;
  sha256?: unknown;
  fileSize?: unknown;
  publishedAt?: unknown;
  releaseNotes?: unknown;
}

const GITHUB_REPO = "halluyapp/hallyu-tv";
const UPDATES_CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}app-updates/`;
const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Hallyu-App-Updater",
};

export async function getCurrentAppVersion(): Promise<string> {
  return Constants.expoConfig?.version ?? "0.1.0";
}

export function getCurrentAppVersionCode(): number {
  return Constants.expoConfig?.android?.versionCode ?? 1;
}

export async function clearOldUpdates(keepFileName?: string): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(UPDATES_CACHE_DIR);
    if (!dirInfo.exists) return;
    if (!keepFileName) {
      await FileSystem.deleteAsync(UPDATES_CACHE_DIR, { idempotent: true });
      return;
    }
    const entries = await FileSystem.readDirectoryAsync(UPDATES_CACHE_DIR);
    await Promise.all(
      entries
        .filter((entry) => entry !== keepFileName)
        .map((entry) => FileSystem.deleteAsync(`${UPDATES_CACHE_DIR}${entry}`, { idempotent: true })),
    );
  } catch {
    // Cache cleanup is best-effort and never breaks the app.
  }
}

function isAllowedGithubReleaseUrl(url: string): boolean {
  return (
    url.startsWith(`https://github.com/${GITHUB_REPO}/releases/`) ||
    url.startsWith("https://objects.githubusercontent.com/") ||
    url.startsWith("https://release-assets.githubusercontent.com/")
  );
}

export function validateReleaseManifest(
  raw: ManifestFile,
  variant: AppVariant,
  fallbackApkUrl?: string,
  expectedSize?: number,
): ReleaseManifest | null {
  const expectedPackage = getVariantPackageName(variant);
  const expectedAssetName = `hallyu-${variant}.apk`;
  const resolvedApkUrl =
    typeof raw.apkUrl === "string" && isAllowedGithubReleaseUrl(raw.apkUrl)
      ? raw.apkUrl
      : fallbackApkUrl && isAllowedGithubReleaseUrl(fallbackApkUrl)
        ? fallbackApkUrl
        : `https://github.com/${GITHUB_REPO}/releases/latest/download/${expectedAssetName}`;

  if (
    raw.variant !== variant ||
    raw.packageName !== expectedPackage ||
    typeof raw.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(raw.version) ||
    typeof raw.versionCode !== "number" ||
    !Number.isSafeInteger(raw.versionCode) ||
    raw.versionCode < 1 ||
    typeof raw.apkAssetName !== "string" ||
    raw.apkAssetName !== expectedAssetName ||
    typeof raw.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(raw.sha256) ||
    typeof raw.fileSize !== "number" ||
    !Number.isSafeInteger(raw.fileSize) ||
    raw.fileSize < 1 ||
    (typeof expectedSize === "number" && expectedSize > 0 && raw.fileSize !== expectedSize) ||
    typeof raw.releaseNotes !== "string" ||
    !isAllowedGithubReleaseUrl(resolvedApkUrl)
  ) {
    return null;
  }

  return {
    variant,
    version: raw.version,
    versionCode: raw.versionCode,
    packageName: expectedPackage,
    minimumSupportedVersionCode:
      typeof raw.minimumSupportedVersionCode === "number" ? raw.minimumSupportedVersionCode : undefined,
    apkAssetName: raw.apkAssetName,
    sha256: raw.sha256.toLowerCase(),
    fileSize: raw.fileSize,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : undefined,
    releaseNotes: raw.releaseNotes,
    apkUrl: resolvedApkUrl,
  };
}

export function isManifestUpgrade(
  currentVersion: string,
  currentVersionCode: number,
  manifest: Pick<ReleaseManifest, "version" | "versionCode">,
): boolean {
  const semverNewer = isNewerVersion(currentVersion, manifest.version);
  const semverOlder = isNewerVersion(manifest.version, currentVersion);
  if (semverOlder) return false;
  if (manifest.versionCode > currentVersionCode) return true;
  if (semverNewer && manifest.versionCode >= currentVersionCode) return true;
  return false;
}

/**
 * Checks for updates strictly for the running variant (`mobile-update.json` vs `tv-update.json`).
 * Primary path fetches the direct GitHub Release asset URL (avoiding REST API 60/hr rate limits),
 * with automatic fallback to `/repos/.../releases/latest`.
 */
export async function checkForAppUpdates(variantOverride?: AppVariant): Promise<UpdateCheckResult> {
  const currentVariant = variantOverride ?? getAppVariant();
  const currentVersion = await getCurrentAppVersion();
  const currentVersionCode = getCurrentAppVersionCode();
  const base = { currentVersion, currentVersionCode, currentVariant };
  const manifestAssetName = `${currentVariant}-update.json`;
  const apkAssetName = `hallyu-${currentVariant}.apk`;

  // 1. Primary: direct latest release asset (no API rate limit)
  try {
    const directManifestUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/${manifestAssetName}`;
    const directApkUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/${apkAssetName}`;
    const directRes = await fetch(directManifestUrl, {
      headers: { Accept: "application/json", "User-Agent": "Hallyu-App-Updater" },
    });
    if (directRes.ok) {
      const raw = (await directRes.json()) as ManifestFile;
      const manifest = validateReleaseManifest(raw, currentVariant, directApkUrl);
      if (!manifest) {
        return {
          ...base,
          hasUpdate: false,
          manifest: null,
          error: "Published update manifest did not match this Hallyu variant.",
        };
      }
      const hasUpdate = isManifestUpgrade(currentVersion, currentVersionCode, manifest);
      return { ...base, hasUpdate, manifest };
    }
  } catch {
    // Fall through to GitHub Releases API fallback
  }

  // 2. Fallback: GitHub Releases REST API
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: API_HEADERS,
    });
    if (!response.ok) {
      if (response.status === 404) {
        return { ...base, hasUpdate: false, manifest: null };
      }
      return { ...base, hasUpdate: false, manifest: null, error: `Release check returned HTTP ${response.status}` };
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find((asset: any) => asset.name === manifestAssetName);
    const apkAsset = assets.find((asset: any) => asset.name === apkAssetName);
    if (!manifestAsset?.browser_download_url || !apkAsset?.browser_download_url) {
      return {
        ...base,
        hasUpdate: false,
        manifest: null,
        error: `Latest release does not include ${manifestAssetName}`,
      };
    }

    const manifestResponse = await fetch(manifestAsset.browser_download_url, { headers: API_HEADERS });
    if (!manifestResponse.ok) {
      return { ...base, hasUpdate: false, manifest: null, error: `Manifest request returned HTTP ${manifestResponse.status}` };
    }
    const raw = (await manifestResponse.json()) as ManifestFile;
    const manifest = validateReleaseManifest(raw, currentVariant, apkAsset.browser_download_url, apkAsset.size);
    if (!manifest) {
      return {
        ...base,
        hasUpdate: false,
        manifest: null,
        error: "Release manifest does not match the installed Hallyu variant or APK size.",
      };
    }

    const hasUpdate = isManifestUpgrade(currentVersion, currentVersionCode, manifest);
    return { ...base, hasUpdate, manifest };
  } catch (err) {
    return {
      ...base,
      hasUpdate: false,
      manifest: null,
      error: err instanceof Error ? err.message : "Network error checking updates",
    };
  }
}

/**
 * Downloads (or reuses an already-downloaded verified cache file), verifies
 * exact byte size + SHA-256 + package identity natively, and opens the Android
 * Package Installer via Hallyu's dedicated FileProvider.
 */
export async function downloadAndInstallUpdate(
  manifest: ReleaseManifest,
  onProgress?: (progress: number) => void,
): Promise<InstallUpdateResult> {
  const variant = getAppVariant();
  if (manifest.variant !== variant || manifest.packageName !== getVariantPackageName(variant)) {
    return { success: false, error: "This update belongs to a different Hallyu app variant." };
  }
  if (!isAllowedGithubReleaseUrl(manifest.apkUrl) || manifest.apkAssetName !== `hallyu-${variant}.apk`) {
    return { success: false, error: "Invalid APK release asset." };
  }
  if (Platform.OS !== "android") {
    return { success: false, error: "In-app APK updates are supported on Android devices only." };
  }
  if (typeof NativeModules.HallyuDownloader?.verifyAndInstallApk !== "function") {
    return { success: false, error: "Native APK verifier is unavailable in this build." };
  }

  const fileName = `hallyu-${variant}-${manifest.version}-${manifest.versionCode}.apk`;
  const targetUri = `${UPDATES_CACHE_DIR}${fileName}`;
  await clearOldUpdates(fileName);

  try {
    await FileSystem.makeDirectoryAsync(UPDATES_CACHE_DIR, { intermediates: true });

    let readyUri: string | null = null;
    const cached = await FileSystem.getInfoAsync(targetUri);
    if (cached.exists && typeof cached.size === "number" && cached.size === manifest.fileSize) {
      readyUri = targetUri;
      onProgress?.(1);
    } else {
      if (cached.exists) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true });
      }
      const task = FileSystem.createDownloadResumable(manifest.apkUrl, targetUri, {}, (progress) => {
        if (progress.totalBytesExpectedToWrite > 0 && onProgress) {
          onProgress(Math.min(1, progress.totalBytesWritten / progress.totalBytesExpectedToWrite));
        }
      });
      const result = await task.downloadAsync();
      if (!result?.uri) {
        return { success: false, error: "Download did not produce an APK file." };
      }
      const downloaded = await FileSystem.getInfoAsync(result.uri);
      if (!downloaded.exists || typeof downloaded.size !== "number" || downloaded.size !== manifest.fileSize) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        return { success: false, error: "Downloaded APK size did not match the release manifest." };
      }
      readyUri = result.uri;
      onProgress?.(1);
    }

    const nativeFilePath = stripFileScheme(readyUri);
    const verified = await NativeModules.HallyuDownloader.verifyAndInstallApk(
      nativeFilePath,
      manifest.packageName,
      manifest.versionCode,
      manifest.sha256,
    );

    if (verified?.success === true) {
      return { success: true };
    }

    if (verified?.needsPermission === true) {
      // Keep the verified APK cached on disk so tapping "Install Update" after
      // enabling Unknown Sources launches the installer immediately!
      return {
        success: false,
        needsPermission: true,
        error:
          verified?.error ||
          "Allow installs from Hallyu in Android settings, then select Install Update again.",
      };
    }

    await FileSystem.deleteAsync(readyUri, { idempotent: true });
    return {
      success: false,
      error: verified?.error || "APK verification or installer handoff failed.",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to download or verify update.",
    };
  }
}
