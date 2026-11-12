import { NativeModules, Platform } from "react-native";

/**
 * JS bridge to the HallyuDownloader native module (injected at prebuild by
 * plugins/withHallyuDownloader.js). All calls are fire-and-forget promises;
 * progress arrives by polling query() — the module emits no events, which
 * keeps the bridge minimal and reconcilable across app restarts.
 */

interface HallyuDownloaderNativeModule {
  start(key: string, url: string, title: string): Promise<string>;
  query(key: string): Promise<{
    status: "running" | "paused" | "successful" | "failed" | "missing";
    bytes: number;
    total: number;
    reason: number;
    localPath?: string;
    fileSize?: number;
  }>;
  pause(key: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const native: HallyuDownloaderNativeModule | undefined =
  (NativeModules as Record<string, unknown>)?.HallyuDownloader as
    | HallyuDownloaderNativeModule
    | undefined;

/** True when the native DownloadManager engine can be used on this device. */
export function isNativeDownloaderAvailable(): boolean {
  return Platform.OS === "android" && Boolean(native);
}

export const nativeDownloader = {
  /** Enqueue (or replace) the download for a key. Resolves the system id. */
  start(key: string, url: string, title: string): Promise<string> {
    if (!native) return Promise.reject(new Error("Native downloader is not available"));
    return native.start(key, url, title);
  },

  /** Snapshot of one system download. "missing" = not (yet/anymore) tracked. */
  query(key: string): Promise<{
    status: "running" | "paused" | "successful" | "failed" | "missing";
    bytes: number;
    total: number;
    reason: number;
    localPath?: string;
    fileSize?: number;
  } | null> {
    if (!native) return Promise.resolve(null);
    return native.query(key);
  },

  /** Remove the system download and its file. */
  remove(key: string): Promise<void> {
    if (!native) return Promise.resolve();
    return native.remove(key);
  },

  /** Pause a system download (DownloadManager.pauseDownload). */
  pause(key: string): Promise<void> {
    if (!native) return Promise.resolve();
    return native.pause(key);
  },
};
