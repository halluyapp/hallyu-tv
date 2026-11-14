import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { downloadKey, reasonMessage, sizeWithinTolerance, DM_REASON, DM_STATUS } from "../src/services/downloads/reasons";

const PLUGIN = readFileSync(join(import.meta.dir, "..", "plugins", "withHallyuDownloader.js"), "utf8");
const CLIENT = readFileSync(join(import.meta.dir, "..", "src", "services", "provider", "client.ts"), "utf8");

describe("download keys", () => {
  test("stable per title/episode — retries replace, not duplicate", () => {
    expect(downloadKey("4780148614284956296", 1, 1)).toBe("4780148614284956296_1_1");
    expect(downloadKey("4780148614284956296", 1, 1)).toBe(downloadKey("4780148614284956296", 1, 1));
    expect(downloadKey("4780148614284956296", 1, 2)).not.toBe(downloadKey("4780148614284956296", 1, 1));
    expect(downloadKey("3773468085374568272", 0, 0)).not.toBe(downloadKey("4780148614284956296", 0, 0));
  });
});

describe("DownloadManager reason mapping", () => {
  test("insufficient space tells the user to free up space", () => {
    const msg = reasonMessage(DM_STATUS.FAILED, DM_REASON.ERROR_INSUFFICIENT_SPACE);
    expect(msg.toLowerCase()).toContain("storage");
    expect(msg.toLowerCase()).toContain("retry");
  });

  test("HTTP-level failures point at retry for a fresh link", () => {
    for (const reason of [DM_REASON.ERROR_UNHANDLED_HTTP_CODE, DM_REASON.ERROR_HTTP_DATA_ERROR, DM_REASON.ERROR_TOO_MANY_REDIRECTS]) {
      const msg = reasonMessage(DM_STATUS.FAILED, reason);
      expect(msg.toLowerCase()).toContain("retry");
    }
  });

  test("network pauses are not failures", () => {
    const msg = reasonMessage(DM_STATUS.PAUSED, DM_REASON.WAITING_FOR_NETWORK);
    expect(msg.toLowerCase()).toContain("network");
    expect(msg.toLowerCase()).not.toContain("failed");
  });

  test("messages never contain a URL or token", () => {
    for (const status of [DM_STATUS.FAILED, DM_STATUS.PAUSED]) {
      for (const reason of [1, 2, 3, 4, 5, 1001, 1002, 1003, 1004, 1005, 1006, 1008, 1010, 999]) {
        const msg = reasonMessage(status, reason);
        expect(msg).not.toMatch(/https?:\/\//);
        expect(msg).not.toMatch(/token|signature/i);
      }
    }
  });

  test("unknown reasons degrade to a generic retryable message", () => {
    expect(reasonMessage(DM_STATUS.FAILED, 42_424)).toContain("retry");
  });
});

describe("size verification tolerance", () => {
  test("accepts within ±2% of the provider size", () => {
    expect(sizeWithinTolerance(337_609_228, 337_609_228)).toBe(true);
    expect(sizeWithinTolerance(337_609_228 * 0.99, 337_609_228)).toBe(true);
    expect(sizeWithinTolerance(337_609_228 * 1.01, 337_609_228)).toBe(true);
  });

  test("rejects truncation, bloat and empty files", () => {
    expect(sizeWithinTolerance(337_609_228 * 0.9, 337_609_228)).toBe(false);
    expect(sizeWithinTolerance(337_609_228 * 1.1, 337_609_228)).toBe(false);
    expect(sizeWithinTolerance(0, 337_609_228)).toBe(false);
    expect(sizeWithinTolerance(500, null)).toBe(false); // < 1 KB
  });

  test("unknown expected size still requires a real file", () => {
    expect(sizeWithinTolerance(5_000_000, null)).toBe(true);
  });
});

describe("native downloader module (Kotlin injected at prebuild)", () => {
  test("module is registered as an Expo config plugin", () => {
    const appJson = JSON.parse(readFileSync(join(import.meta.dir, "..", "app.json"), "utf8")) as {
      expo?: { plugins?: string[] };
    };
    expect(appJson.expo?.plugins).toContain("./plugins/withHallyuDownloader");
  });

  test("generates both Kotlin files", () => {
    // The plugin is CommonJS; load it through a fresh module evaluation.
    const mod = require("../plugins/withHallyuDownloader.js") as {
      buildDownloaderSources: () => { moduleKt: string; packageKt: string };
    };
    const { moduleKt, packageKt } = mod.buildDownloaderSources();
    expect(moduleKt).toContain('package app.hallyutv.dev');
    expect(moduleKt).toContain('getName(): String = "HallyuDownloader"');
    expect(moduleKt).toContain("DownloadManager.Request");
    expect(moduleKt).toContain("setDestinationInExternalFilesDir");
    expect(packageKt).toContain("class HallyuDownloaderPackage : ReactPackage");
  });

  test("Kotlin request headers match the player's PROVIDER_MEDIA_HEADERS exactly", () => {
    const mod = require("../plugins/withHallyuDownloader.js") as { MEDIA_HEADERS: Record<string, string> };
    const clientHeaders = CLIENT.match(/PROVIDER_MEDIA_HEADERS[^}]*}/s)?.[0] ?? "";
    for (const [key, value] of Object.entries(mod.MEDIA_HEADERS)) {
      // client.ts must declare the same header and the same value
      expect(clientHeaders).toContain(key);
      expect(clientHeaders).toContain(value);
      // and the Kotlin module must embed it
      expect(PLUGIN).toContain(value);
    }
    expect(Object.keys(mod.MEDIA_HEADERS).sort()).toEqual(["Origin", "Referer", "User-Agent"]);
  });

  test("native module never persists or logs the signed URL", () => {
    expect(PLUGIN).not.toMatch(/https:\/\/(?!www\.movieboxpro\.app|moviebox\.ph)[a-z0-9.]+/i);
  });
});
