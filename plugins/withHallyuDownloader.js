/**
 * Expo config plugin: injects `HallyuDownloader`, a native Kotlin module that
 * runs movie/episode downloads through Android's built-in DownloadManager,
 * configures a dedicated FileProvider for verified in-app APK updates, and
 * wires release keystore signing cleanly without breaking debug builds.
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/** Mirror of PROVIDER_MEDIA_HEADERS (src/services/provider/client.ts). */
const MEDIA_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Origin: "https://moviebox.ph",
};

const PACKAGE = "app.hallyutv.dev";

/** The Kotlin files as text. Kept pure so unit tests can assert on them. */
function buildDownloaderSources(packageName = PACKAGE) {
  const moduleKt = `package ${packageName}

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.database.Cursor
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.MessageDigest

/**
 * Runs downloads through the system DownloadManager, reports status back
 * to JS, and provides SHA-256 + package-verified Android APK installer handoff.
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

    private fun resolveLocalFile(rawPath: String): File {
        val trimmed = rawPath.trim()
        if (trimmed.startsWith("file://")) {
            val parsed = Uri.parse(trimmed).path
            if (!parsed.isNullOrEmpty()) return File(parsed)
            return File(trimmed.removePrefix("file://"))
        }
        return File(trimmed)
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
    fun canInstallPackages(promise: Promise) {
        try {
            if (android.os.Build.VERSION.SDK_INT < 26) {
                promise.resolve(true)
            } else {
                promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
            }
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun verifyAndInstallApk(
        filePath: String,
        expectedPackage: String,
        expectedVersionCode: Double,
        expectedSha256: String,
        promise: Promise
    ) {
        try {
            val file = resolveLocalFile(filePath)
            if (!file.isFile || !file.canRead()) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", false)
                    putString("error", "Downloaded APK file is missing or unreadable on disk.")
                })
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
                    putBoolean("corrupt", true)
                    putString("error", "APK SHA-256 checksum verification failed.")
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
                    putBoolean("corrupt", true)
                    putString("error", "APK package or version code does not match this installed Hallyu variant.")
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
                    putBoolean("needsPermission", true)
                    putString("error", "Allow installs from Hallyu in Android settings, then select Install Update again.")
                })
                return
            }

            val authority = "\${reactContext.packageName}.hallyu.updateprovider"
            val contentUri = FileProvider.getUriForFile(reactContext, authority, file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
            })
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

function patchUpdateFileProviderManifest(manifest, packageName = PACKAGE) {
  const application = manifest.manifest?.application?.[0];
  if (!application) return manifest;
  application.provider = application.provider ?? [];
  const authority = `${packageName}.hallyu.updateprovider`;
  const exists = application.provider.some((p) => p.$?.["android:authorities"] === authority);
  if (!exists) {
    application.provider.push({
      $: {
        "android:name": "androidx.core.content.FileProvider",
        "android:authorities": authority,
        "android:exported": "false",
        "android:grantUriPermissions": "true",
      },
      "meta-data": [
        {
          $: {
            "android:name": "android.support.FILE_PROVIDER_PATHS",
            "android:resource": "@xml/hallyu_update_paths",
          },
        },
      ],
    });
  }
  return manifest;
}

function writeUpdateFileProviderPaths(androidProjectRoot) {
  const xmlDir = path.join(androidProjectRoot, "app", "src", "main", "res", "xml");
  fs.mkdirSync(xmlDir, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="hallyu_cache" path="." />
    <external-cache-path name="hallyu_ext_cache" path="." />
    <files-path name="hallyu_files" path="." />
    <external-files-path name="hallyu_ext_files" path="." />
</paths>
`;
  fs.writeFileSync(path.join(xmlDir, "hallyu_update_paths.xml"), xml, "utf8");
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
    src = src.replace(anchor, `${anchor}\n                add(HallyuDownloaderPackage())`);
  } else {
    const generic = "PackageList(this).packages";
    if (!src.includes(generic)) {
      throw new Error("withHallyuDownloader: could not locate a package registration anchor in MainApplication.kt");
    }
    src = src.replace(generic, "PackageList(this).packages.toMutableList().apply { add(HallyuDownloaderPackage()) }");
  }
  fs.writeFileSync(mainAppPath, src, "utf8");
}

/**
 * Safely patches release signing in app/build.gradle without touching debug
 * signing, and falls back to signingConfigs.debug when CI release secrets are
 * not supplied so PR / local verification builds still succeed cleanly.
 */
function patchReleaseSigningSource(src) {
  if (src.includes("HALLYU_RELEASE_SIGNING")) return src;
  const signingAnchor = "    signingConfigs {";
  if (!src.includes(signingAnchor)) {
    throw new Error("withHallyuDownloader: could not locate Android signingConfigs");
  }
  const hasReleaseEnvExpr =
    '(System.getenv("ANDROID_KEYSTORE_PATH") && System.getenv("ANDROID_KEYSTORE_PASSWORD") && System.getenv("ANDROID_KEY_ALIAS") && System.getenv("ANDROID_KEY_PASSWORD"))';
  const releaseSigning = `    signingConfigs {
        // HALLYU_RELEASE_SIGNING: CI release builds use protected keystore secrets; local/PR builds fall back safely.
        release {
            if (${hasReleaseEnvExpr}) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
`;
  let out = src.replace(signingAnchor, releaseSigning);

  const buildTypesIdx = out.indexOf("    buildTypes {");
  if (buildTypesIdx >= 0) {
    const before = out.slice(0, buildTypesIdx);
    const after = out.slice(buildTypesIdx).replace(
      /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      `$1ndk { abiFilters "armeabi-v7a", "arm64-v8a" }\n            signingConfig (${hasReleaseEnvExpr} ? signingConfigs.release : signingConfigs.debug)`,
    );
    out = before + after;
  }
  return out;
}

function patchReleaseSigning(androidProjectRoot) {
  const gradlePath = path.join(androidProjectRoot, "app/build.gradle");
  if (!fs.existsSync(gradlePath)) return;
  const src = fs.readFileSync(gradlePath, "utf8");
  const patched = patchReleaseSigningSource(src);
  if (patched !== src) {
    fs.writeFileSync(gradlePath, patched, "utf8");
  }
}

const withHallyuDownloader = (config) => {
  config = withAndroidManifest(config, (modConfig) => {
    const pkg = modConfig.android?.package || PACKAGE;
    modConfig.modResults = patchUpdateFileProviderManifest(modConfig.modResults, pkg);
    return modConfig;
  });
  config = withDangerousMod(config, [
    "android",
    (modConfig) => {
      const pkg = modConfig.android?.package || PACKAGE;
      const androidRoot = path.join(modConfig.modRequest.projectRoot, "android");
      writeUpdateFileProviderPaths(androidRoot);
      patchMainApplication(androidRoot, pkg);
      patchReleaseSigning(androidRoot);
      return modConfig;
    },
  ]);
  return config;
};

module.exports = withHallyuDownloader;
module.exports.buildDownloaderSources = buildDownloaderSources;
module.exports.MEDIA_HEADERS = MEDIA_HEADERS;
module.exports.PACKAGE = PACKAGE;
module.exports.patchReleaseSigning = patchReleaseSigning;
module.exports.patchReleaseSigningSource = patchReleaseSigningSource;
module.exports.patchUpdateFileProviderManifest = patchUpdateFileProviderManifest;
