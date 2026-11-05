import { Platform, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { isNewerVersion, parseSemver } from "./version";

export { isNewerVersion, parseSemver };

export interface ReleaseInfo {
  version: string;
  tag: string;
  name: string;
  body: string;
  publishedAt: string;
  downloadUrl: string | null;
  sizeBytes: number | null;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestRelease: ReleaseInfo | null;
}

const GITHUB_REPO = "halluyapp/hallyu-tv";
const UPDATES_CACHE_DIR = `${FileSystem.cacheDirectory}app-updates/`;

export async function getCurrentAppVersion(): Promise<string> {
  const version = Constants.expoConfig?.version ?? "1.0.0";
  return version;
}

export async function clearOldUpdates(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(UPDATES_CACHE_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(UPDATES_CACHE_DIR, { idempotent: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = await getCurrentAppVersion();
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "HallyuTV-App",
      },
    });

    if (!response.ok) {
      return { hasUpdate: false, currentVersion, latestRelease: null };
    }

    const data = await response.json();
    const tag = data.tag_name || "";
    const releaseVersion = tag.replace(/^v/, "");

    let downloadUrl: string | null = null;
    let sizeBytes: number | null = null;
    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find(
        (a: { name?: string; browser_download_url?: string }) =>
          typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk")
      );
      if (apkAsset) {
        downloadUrl = apkAsset.browser_download_url ?? null;
        sizeBytes = apkAsset.size ?? null;
      }
    }

    if (!downloadUrl && data.html_url) {
      downloadUrl = data.html_url;
    }

    const latestRelease: ReleaseInfo = {
      version: releaseVersion,
      tag,
      name: data.name || tag,
      body: data.body || "",
      publishedAt: data.published_at || "",
      downloadUrl,
      sizeBytes,
    };

    const hasUpdate = isNewerVersion(currentVersion, releaseVersion);
    return { hasUpdate, currentVersion, latestRelease };
  } catch {
    return { hasUpdate: false, currentVersion, latestRelease: null };
  }
}

export async function startUpdateDownload(
  release: ReleaseInfo,
  onProgress?: (progress: number) => void
): Promise<string | null> {
  if (!release.downloadUrl) return null;

  if (Platform.OS !== "android") {
    await Linking.openURL(release.downloadUrl);
    return null;
  }

  // Clear previous downloaded updates to preserve device storage
  await clearOldUpdates();

  try {
    await FileSystem.makeDirectoryAsync(UPDATES_CACHE_DIR, { intermediates: true });
    const targetFile = `${UPDATES_CACHE_DIR}hallyu-tv-${release.version}.apk`;

    const downloadResumable = FileSystem.createDownloadResumable(
      release.downloadUrl,
      targetFile,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0 && onProgress) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress(Math.min(1, Math.max(0, progress)));
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (result && result.uri) {
      return result.uri;
    }
    return null;
  } catch {
    await Linking.openURL(release.downloadUrl);
    return null;
  }
}
