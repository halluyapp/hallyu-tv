import { Platform, NativeModules } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { isNewerVersion, parseSemver } from "./version";
import { getAppVariant, getVariantPackageName, type AppVariant } from "@/config/appVariant";

export { isNewerVersion, parseSemver };

export interface ReleaseManifest {
  variant: AppVariant;
  version: string;
  versionCode: number;
  packageName: string;
  minimumSupportedVersionCode?: number;
  apkAssetName: string;
  sha256: string;
  fileSize: number;
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

interface ManifestFile {
  variant?: unknown;
  version?: unknown;
  versionCode?: unknown;
  packageName?: unknown;
  minimumSupportedVersionCode?: unknown;
  apkAssetName?: unknown;
  sha256?: unknown;
  fileSize?: unknown;
  releaseNotes?: unknown;
}

const GITHUB_REPO = "halluyapp/hallyu-tv";
const UPDATES_CACHE_DIR = `${FileSystem.cacheDirectory}app-updates/`;
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

export async function clearOldUpdates(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(UPDATES_CACHE_DIR);
    if (dirInfo.exists) await FileSystem.deleteAsync(UPDATES_CACHE_DIR, { idempotent: true });
  } catch {
    // A failed best-effort cache cleanup must not damage the installed app or its data.
  }
}

function validateManifest(raw: ManifestFile, variant: AppVariant, apkUrl: string, size: number): ReleaseManifest | null {
  const expectedPackage = getVariantPackageName(variant);
  if (
    raw.variant !== variant ||
    raw.packageName !== expectedPackage ||
    typeof raw.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(raw.version) ||
    typeof raw.versionCode !== "number" ||
    !Number.isSafeInteger(raw.versionCode) || raw.versionCode < 1 ||
    typeof raw.apkAssetName !== "string" ||
    raw.apkAssetName !== `hallyu-${variant}.apk` ||
    typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(raw.sha256) ||
    typeof raw.fileSize !== "number" || !Number.isSafeInteger(raw.fileSize) || raw.fileSize < 1 ||
    raw.fileSize !== size ||
    typeof raw.releaseNotes !== "string" ||
    !apkUrl.startsWith("https://")
  ) return null;

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
    releaseNotes: raw.releaseNotes,
    apkUrl,
  };
}

/** Fetches only this variant's strict manifest and exact APK release asset. */
export async function checkForAppUpdates(variantOverride?: AppVariant): Promise<UpdateCheckResult> {
  const currentVariant = variantOverride ?? getAppVariant();
  const currentVersion = await getCurrentAppVersion();
  const currentVersionCode = getCurrentAppVersionCode();
  const base = { currentVersion, currentVersionCode, currentVariant };

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: API_HEADERS,
    });
    if (!response.ok) return { ...base, hasUpdate: false, manifest: null, error: `Release check returned HTTP ${response.status}` };

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAssetName = `${currentVariant}-update.json`;
    const apkAssetName = `hallyu-${currentVariant}.apk`;
    const manifestAsset = assets.find((asset: any) => asset.name === manifestAssetName);
    const apkAsset = assets.find((asset: any) => asset.name === apkAssetName);
    if (!manifestAsset?.browser_download_url || !apkAsset?.browser_download_url) {
      return { ...base, hasUpdate: false, manifest: null, error: `Release is missing ${manifestAssetName} or ${apkAssetName}` };
    }

    const manifestResponse = await fetch(manifestAsset.browser_download_url, { headers: API_HEADERS });
    if (!manifestResponse.ok) {
      return { ...base, hasUpdate: false, manifest: null, error: `Manifest request returned HTTP ${manifestResponse.status}` };
    }
    const raw = await manifestResponse.json() as ManifestFile;
    const manifest = validateManifest(raw, currentVariant, apkAsset.browser_download_url, apkAsset.size);
    if (!manifest) {
      return { ...base, hasUpdate: false, manifest: null, error: "Release manifest does not match the app variant or APK asset" };
    }

    const newerCode = manifest.versionCode > currentVersionCode;
    const newerVersion = isNewerVersion(currentVersion, manifest.version);
    const hasUpdate = newerCode && newerVersion;
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

/** Downloads, verifies against release size + SHA-256, then asks Android to verify and open the installer. */
export async function downloadAndInstallUpdate(
  manifest: ReleaseManifest,
  onProgress?: (progress: number) => void,
): Promise<{ success: boolean; error?: string }> {
  const variant = getAppVariant();
  if (manifest.variant !== variant || manifest.packageName !== getVariantPackageName(variant)) {
    return { success: false, error: "This release is not for the installed Hallyu app variant." };
  }
  if (!manifest.apkUrl.startsWith("https://") || manifest.apkAssetName !== `hallyu-${variant}.apk`) {
    return { success: false, error: "Invalid APK release asset." };
  }
  if (Platform.OS !== "android") return { success: false, error: "APK updates are available on Android only." };
  if (typeof NativeModules.HallyuDownloader?.verifyAndInstallApk !== "function") {
    return { success: false, error: "Secure Android APK verification is unavailable in this build." };
  }

  await clearOldUpdates();
  try {
    await FileSystem.makeDirectoryAsync(UPDATES_CACHE_DIR, { intermediates: true });
    const targetFile = `${UPDATES_CACHE_DIR}hallyu-${variant}-${manifest.version}.apk`;
    const task = FileSystem.createDownloadResumable(manifest.apkUrl, targetFile, {}, (progress) => {
      if (progress.totalBytesExpectedToWrite > 0 && onProgress) {
        onProgress(Math.min(1, progress.totalBytesWritten / progress.totalBytesExpectedToWrite));
      }
    });
    const result = await task.downloadAsync();
    if (!result?.uri) return { success: false, error: "Download did not produce a valid APK file." };

    const file = await FileSystem.getInfoAsync(result.uri);
    if (!file.exists || typeof file.size !== "number" || file.size !== manifest.fileSize) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      return { success: false, error: "Downloaded APK size does not match the signed release manifest." };
    }

    const verified = await NativeModules.HallyuDownloader.verifyAndInstallApk(
      result.uri, manifest.packageName, manifest.versionCode, manifest.sha256,
    );
    if (verified?.success === true) return { success: true };
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    return { success: false, error: verified?.error || "APK verification or installer handoff failed." };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to download or verify update." };
  }
}
