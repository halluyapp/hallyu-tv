/**
 * Expo config plugin: injects `HallyuDownloader`, a small native module that
 * runs movie/episode downloads through Android's built-in DownloadManager
 * and provides safe native APK installer handoff.
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
function buildDownloaderSources(packageName = PACKAGE) {
  const moduleKt = `package ${packageName}

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.provider.Settings
import java.security.MessageDigest
import android.database.Cursor
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Runs downloads through the system DownloadManager, reports status back
 * to JS, and provides native Android APK installer launching.
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
                .setTitle(safeTitle.ifEmpty { "Hallyu" })
                .setDescription("Saving for offline viewing in Hallyu")
                .setMimeType("video/mp4")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverRoaming(false)
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

    @ReactMethod
    fun pause(key: String, promise: Promise) {
        try {
            val id = prefs.getLong(key, -1L)
            if (id >= 0) downloadManager().pauseDownload(id)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_PAUSE", e.message ?: "pause failed", e)
        }
    }

    @ReactMethod
    fun verifyAndInstallApk(filePath: String, expectedPackage: String, expectedVersionCode: Double, expectedSha256: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.isFile || !file.canRead()) {
                promise.reject("E_FILE_NOT_FOUND", "Downloaded APK is not readable")
                return
            }
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualHash.equals(expectedSha256, ignoreCase = true)) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", false)
                    putString("error", "APK SHA-256 verification failed")
                })
                return
            }

            @Suppress("DEPRECATION")
            val archive = reactContext.packageManager.getPackageArchiveInfo(file.absolutePath, 0)
            val archivePackage = archive?.packageName
            val archiveVersion = if (android.os.Build.VERSION.SDK_INT >= 28) {
                archive?.longVersionCode
            } else {
                @Suppress("DEPRECATION") archive?.versionCode?.toLong()
            }
            if (archivePackage != expectedPackage || archiveVersion != expectedVersionCode.toLong()) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", false)
                    putString("error", "APK package or version does not match this app")
                })
                return
            }

            if (android.os.Build.VERSION.SDK_INT >= 26 && !reactContext.packageManager.canRequestPackageInstalls()) {
                val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:" + reactContext.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(settingsIntent)
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", false)
                    putString("error", "Allow installs from Hallyu in Android settings, then tap Install Update again.")
                })
                return
            }

            val contentUri = FileProvider.getUriForFile(
                reactContext,
                "\${reactContext.packageName}.FileSystemFileProvider",
                file
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
        } catch (e: Exception) {
            promise.reject("E_INSTALL", e.message ?: "APK verification or installer handoff failed", e)
        }
    }

}
`;

  const packageKt = `package ${packageName}

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
function patchMainApplication(androidProjectRoot, packageName = PACKAGE) {
  const pkgDir = path.join(androidProjectRoot, "app/src/main/java", ...packageName.split("."));
  const mainAppPath = path.join(pkgDir, "MainApplication.kt");
  if (!fs.existsSync(mainAppPath)) {
    throw new Error(`withHallyuDownloader: expected generated MainApplication.kt at ${mainAppPath}`);
  }

  const { moduleKt, packageKt } = buildDownloaderSources(packageName);
  fs.writeFileSync(path.join(pkgDir, "HallyuDownloaderModule.kt"), moduleKt, "utf8");
  fs.writeFileSync(path.join(pkgDir, "HallyuDownloaderPackage.kt"), packageKt, "utf8");

  let src = fs.readFileSync(mainAppPath, "utf8");
  if (src.includes("HallyuDownloaderPackage")) return;

  const anchor = "PackageList(this).packages.apply {";
  if (src.includes(anchor)) {
    src = src.replace(
      anchor,
      `${anchor}\n                add(HallyuDownloaderPackage())`,
    );
  } else {
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

function patchReleaseSigning(androidProjectRoot) {
  const gradlePath = path.join(androidProjectRoot, "app/build.gradle");
  if (!fs.existsSync(gradlePath)) return;
  let src = fs.readFileSync(gradlePath, "utf8");
  if (src.includes("HALLYU_RELEASE_SIGNING")) return;
  const signingAnchor = "    signingConfigs {";
  const releaseSigning = `    signingConfigs {
        // HALLYU_RELEASE_SIGNING: local builds use Expo's debug key; release CI supplies protected secrets.
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH") && System.getenv("ANDROID_KEYSTORE_PASSWORD") && System.getenv("ANDROID_KEY_ALIAS") && System.getenv("ANDROID_KEY_PASSWORD")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
`;
  if (!src.includes(signingAnchor)) throw new Error("withHallyuDownloader: could not locate Android signingConfigs");
  src = src.replace(signingAnchor, releaseSigning);
  // Keep release builds using signingConfigs.debug unless CI explicitly
  // overrides via release secrets. This keeps PRs and regular pushes
  // buildable without keystore secrets.
  fs.writeFileSync(gradlePath, src, "utf8");
}

const withHallyuDownloader = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const pkg = config.android?.package || PACKAGE;
      const androidRoot = path.join(config.modRequest.projectRoot, "android");
      patchMainApplication(androidRoot, pkg);
      patchReleaseSigning(androidRoot);
      return config;
    },
  ]);

module.exports = withHallyuDownloader;
module.exports.buildDownloaderSources = buildDownloaderSources;
module.exports.MEDIA_HEADERS = MEDIA_HEADERS;
module.exports.PACKAGE = PACKAGE;
module.exports.patchReleaseSigning = patchReleaseSigning;
