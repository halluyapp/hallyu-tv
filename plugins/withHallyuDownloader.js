/**
 * Expo config plugin: injects `HallyuDownloader`, a small native module that
 * runs movie/episode downloads through Android's built-in DownloadManager.
 *
 * Why: the JS download path (expo-file-system) only makes progress while the
 * app process is alive in the foreground. The system DownloadManager keeps
 * downloading in the background, survives app death and reboots, retries on
 * connectivity changes, and shows a system notification with progress.
 *
 * The module uses only public Android APIs (android.app.DownloadManager,
 * SharedPreferences) plus the React Native bridge that prebuild generates.
 * DownloadManager cannot pause, so jobs started through it offer no pause;
 * the JS fallback keeps pause for platforms/contexts without the module.
 *
 * Files are written to the app's private external files folder — no storage
 * permission is needed, they are app-private and playable in place.
 *
 * The request must look like the player. `MEDIA_HEADERS` below MUST stay in
 * sync with PROVIDER_MEDIA_HEADERS in src/services/provider/client.ts —
 * tests/downloads.test.ts fails if they drift apart.
 */

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/** Mirror of PROVIDER_MEDIA_HEADERS (src/services/provider/client.ts). */
const MEDIA_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Origin: "https://moviebox.ph",
};

const PACKAGE = "app.hallyutv.dev";

/** The Kotlin files as text. Kept pure so a unit test can assert on them. */
function buildDownloaderSources() {
  const moduleKt = `package ${PACKAGE}

import android.app.DownloadManager
import android.content.Context
import android.content.SharedPreferences
import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Runs downloads through the system DownloadManager and reports status back
 * to JS. Jobs are keyed by a stable JS-provided key; the system download id
 * is persisted in SharedPreferences so status and removal survive restarts.
 */
class HallyuDownloaderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences =
        reactContext.getSharedPreferences("hallyutv_downloads", Context.MODE_PRIVATE)

    override fun getName(): String = "HallyuDownloader"

    private fun safeName(key: String): String = key.replace(Regex("[^A-Za-z0-9_-]"), "_")

    private fun relativePath(key: String): String = "hallyu-dl/" + safeName(key) + ".mp4"

    private fun targetFile(key: String): File {
        val base = reactContext.getExternalFilesDir(null) ?: reactContext.filesDir
        return File(base, relativePath(key))
    }

    private fun downloadManager(): DownloadManager =
        reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    @ReactMethod
    fun start(key: String, url: String, title: String, promise: Promise) {
        try {
            val dm = downloadManager()
            val old = prefs.getLong(key, -1L)
            if (old >= 0) dm.remove(old)
            val file = targetFile(key)
            file.parentFile?.mkdirs()
            if (file.exists()) file.delete()
            val safeTitle = if (title.trim().startsWith("Hallyu")) title.trim().take(80) else "Hallyu · " + title.trim().take(70)
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(safeTitle.ifEmpty { "Hallyu TV" })
                .setDescription("Saving for offline viewing in Hallyu TV")
                .setMimeType("video/mp4")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverRoaming(false)
                // DownloadManager.Request has no setUserAgent; header injection is
                // the only way to send the identity the media host accepts. These
                // MUST match the player's PROVIDER_MEDIA_HEADERS.
                .addRequestHeader("User-Agent", "${MEDIA_HEADERS["User-Agent"]}")
                .addRequestHeader("Referer", "${MEDIA_HEADERS["Referer"]}")
                .addRequestHeader("Origin", "${MEDIA_HEADERS["Origin"]}")
                .setDestinationInExternalFilesDir(reactContext, null, relativePath(key))
            if (android.os.Build.VERSION.SDK_INT >= 24) request.setAllowedOverMetered(true)
            val id = dm.enqueue(request)
            prefs.edit().putLong(key, id).apply()
            promise.resolve(id.toString())
        } catch (e: Exception) {
            promise.reject("E_START", e.message ?: "start failed", e)
        }
    }

    @ReactMethod
    fun query(key: String, promise: Promise) {
        var cursor: Cursor? = null
        try {
            val out = Arguments.createMap()
            val id = prefs.getLong(key, -1L)
            if (id < 0) {
                out.putString("status", "missing")
                out.putDouble("reason", -1.0)
                promise.resolve(out)
                return
            }
            cursor = downloadManager().query(DownloadManager.Query().setFilterById(id))
            if (cursor == null || !cursor.moveToFirst()) {
                out.putString("status", "missing")
                out.putDouble("reason", -1.0)
            } else {
                val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                val soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                // COLUMN_REASON is the only failure detail the system gives: no
                // space, an HTTP error, too many redirects, a blocked network.
                val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                val label = when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> "successful"
                    DownloadManager.STATUS_FAILED -> "failed"
                    DownloadManager.STATUS_PAUSED -> "paused"
                    else -> "running"
                }
                out.putString("status", label)
                out.putDouble("bytes", soFar.toDouble())
                out.putDouble("total", total.toDouble())
                out.putDouble("reason", reason.toDouble())
                val file = targetFile(key)
                out.putString("localPath", file.absolutePath)
                out.putDouble("fileSize", if (file.exists()) file.length().toDouble() else -1.0)
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("E_QUERY", e.message ?: "query failed", e)
        } finally {
            cursor?.close()
        }
    }

    @ReactMethod
    fun remove(key: String, promise: Promise) {
        try {
            val id = prefs.getLong(key, -1L)
            if (id >= 0) downloadManager().remove(id)
            prefs.edit().remove(key).apply()
            targetFile(key).delete()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_REMOVE", e.message ?: "remove failed", e)
        }
    }
}
`;

  const packageKt = `package ${PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class HallyuDownloaderPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(HallyuDownloaderModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

  return { moduleKt, packageKt };
}

/** Patch the generated MainApplication.kt so the package is registered. */
function patchMainApplication(androidProjectRoot) {
  const pkgDir = path.join(androidProjectRoot, "app/src/main/java", ...PACKAGE.split("."));
  const mainAppPath = path.join(pkgDir, "MainApplication.kt");
  if (!fs.existsSync(mainAppPath)) {
    throw new Error(`withHallyuDownloader: expected generated MainApplication.kt at ${mainAppPath}`);
  }

  const { moduleKt, packageKt } = buildDownloaderSources();
  fs.writeFileSync(path.join(pkgDir, "HallyuDownloaderModule.kt"), moduleKt, "utf8");
  fs.writeFileSync(path.join(pkgDir, "HallyuDownloaderPackage.kt"), packageKt, "utf8");

  let src = fs.readFileSync(mainAppPath, "utf8");
  if (src.includes("HallyuDownloaderPackage")) return;

  // Expo SDK 54 template anchor:
  //   PackageList(this).packages.apply {
  const anchor = "PackageList(this).packages.apply {";
  if (src.includes(anchor)) {
    src = src.replace(
      anchor,
      `${anchor}\n                add(HallyuDownloaderPackage())`,
    );
  } else {
    // Fallback: any `PackageList(this).packages` expression becomes a list
    // with our package appended.
    const generic = "PackageList(this).packages";
    if (!src.includes(generic)) {
      throw new Error("withHallyuDownloader: could not locate a package registration anchor in MainApplication.kt");
    }
    src = src.replace(
      generic,
      "PackageList(this).packages.toMutableList().apply { add(HallyuDownloaderPackage()) }",
    );
  }
  fs.writeFileSync(mainAppPath, src, "utf8");
}

const withHallyuDownloader = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      patchMainApplication(path.join(config.modRequest.projectRoot, "android"));
      return config;
    },
  ]);

module.exports = withHallyuDownloader;
module.exports.buildDownloaderSources = buildDownloaderSources;
module.exports.MEDIA_HEADERS = MEDIA_HEADERS;
module.exports.PACKAGE = PACKAGE;
