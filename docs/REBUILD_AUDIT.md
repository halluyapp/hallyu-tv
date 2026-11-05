# Hallyu Architecture & Rebuild Audit

**Target Repository:** `halluyapp/hallyu-tv`  
**Date:** November 2026  
**Auditor:** Lovable Engineering  
**Scope:** Rebuild as two independent Android APKs (Hallyu Mobile & Hallyu TV) with one shared streaming foundation.

---

## 1. What Currently Works

- **Provider Integration (`src/services/provider/`):**
  - Direct Zarhosting public API integration (`https://movieapi.zarhosting.dpdns.org/api/public/v1`) without API key.
  - Correct endpoint calls: `/home`, `/search`, `/detail/{slug}`, `/stream/{subject_id}`, and `/stream/{subject_id}/captions`.
  - Exact headers preserved: `User-Agent: Mozilla/5.0`, `Referer: https://moviebox.ph/`, `Accept: application/json`.
  - Stream normalization in `streams.ts` accurately filters preview-only streams and classifies full-length items.
- **Local Persistence & Playback State (`src/services/localLibrary.ts`, `src/state/LibraryContext.tsx`):**
  - Fully local AsyncStorage persistence for Watchlist and Continue Watching progress (keyed by subjectId, season, episode).
  - No backend dependency required for local library.
- **Subtitle Management (`src/services/subtitles/`):**
  - Robust SRT and WebVTT parsers with cue timing and milliseconds normalization (`srt.ts`).
  - Automatic language preference matching and on-device cue caching (`cache.ts`).
- **Android Background Downloads (`plugins/withHallyuDownloader.js`, `src/services/downloads/`):**
  - Native Android DownloadManager integration generated at Expo prebuild time, keeping downloads running in the background.
  - Safe app-private external storage paths and tolerant size verification.

---

## 2. What Is Broken or Risky (With Evidence)

1. **Obsolete Authentication & Pairing (`src/services/auth/`, `src/screens/tv/TvPairingScreen.tsx`):**
   - *Evidence:* Commit `43658c6` introduced local mock Google sign-in and a 6-digit TV PIN pairing flow.
   - *Risk:* Breaches the user brief (Section 9: owner explicitly rejected Google auth, TV pairing, and PIN/QR sync).
   - *Fix:* Remove `AuthContext.tsx`, `authTypes.ts`, `GoogleSignInButton.tsx`, `TvPairingScreen.tsx`, and clean all references.
2. **Single APK Sniffing Runtime Instead of Two Distinct APKs (`src/navigation/RootNavigator.tsx`):**
   - *Evidence:* `RootNavigator.tsx` checks `if (stage.remote)` at runtime to branch between TV and mobile.
   - *Risk:* TV bundle and mobile bundle are co-mingled; both share package ID `app.hallyutv.dev`, TV Leanback manifest is bundled into phone APKs, and mobile touch logic affects TV.
   - *Fix:* Split build targets into `mobile` and `tv` via dynamic Expo config (`app.config.js`), dedicated package names, distinct launcher configurations, and independent navigation roots.
3. **Flawed In-App Updater (`src/services/updater/appUpdater.ts`):**
   - *Evidence:* `appUpdater.ts` fetches `releases/latest`, falls back to `data.html_url` (downloading an HTML page as an APK!), lacks variant differentiation (TV can download Mobile APK and vice-versa), lacks SHA-256 verification, and fails to initiate real Android package installer handoff (`result.uri` returned without launching `ACTION_VIEW` intent).
   - *Fix:* Variant-targeted release manifest (`mobile-update.json` and `tv-update.json`), APK asset resolution, SHA-256 checksum verification, and native Intent package installer handoff.
4. **TV Focus and Remote Navigation Polish:**
   - *Evidence:* TV sidebar was simple pressable items without full collapsible sidebar, keyboard search was incomplete for 10-foot remote D-pad input, and details lacked clean remote focus hierarchy.
   - *Fix:* Implement complete TV collapsible sidebar with D-pad navigation, on-screen remote keyboard for search, and dedicated TV details layout.

---

## 3. What Can Be Reused Unchanged

- All provider client logic (`client.ts`, `adapter.ts`, `homeCatalogue.ts`, `streams.ts`).
- Subtitle parsing and caching (`srt.ts`, `cache.ts`).
- Sound effects and context (`SoundContext.tsx`).
- Core tokens, depth, and glass styling primitives (`tokens.ts`, `depth.ts`).
- Downloader plugin and manager logic (`withHallyuDownloader.js`, `manager.ts`, `paths.ts`).

---

## 4. What Must Become Mobile-Specific

- **Mobile Navigation Root:** Touch-first bottom glass dock (Home, Discover, Downloads, Profile).
- **Mobile Screens:** Touch-optimized `HomeScreen`, `DiscoverScreen`, `DownloadsScreen`, `MySpaceScreen`, `DetailsScreen`.
- **Mobile Player:** Gesture-driven (tap for HUD, double-tap seek, swipe progress), portrait/landscape handling.
- **Mobile Updater:** Touch-friendly update sheet in Profile with direct download & install flow.

---

## 5. What Must Become TV-Specific

- **TV Navigation Root:** 10-foot cinematic layout with collapsible left rail/spine.
- **TV Screens:** Remote-navigable `TvHomeScreen`, `TvSearchScreen` (with TV keyboard), `TvDetailsScreen`, `TvDownloadsScreen`, `TvSettingsScreen`.
- **TV Focus Architecture:** Visible focus states (accent glow, scale), hardware D-pad handling, predictable Back button navigation.
- **TV Player:** Remote-first HUD (OK/Select toggle, Left/Right 10s skip, bottom-anchored controls, focusable subtitle/audio/resolution pickers).
- **TV Updater:** 10-foot D-pad focusable dialog with download progress and safe installer prompt.

---

## 6. What Should Be Shared

- `src/services/provider/` (API client, stream resolver, catalogue loader).
- `src/services/subtitles/` (cues, cache, WebVTT/SRT).
- `src/services/updater/` (release metadata parser, semver comparison, APK downloader, SHA-256 validator).
- `src/services/localLibrary.ts` and `LibraryContext.tsx` (on-device watchlist and progress persistence).
- `src/design-system/` (color palette, spacing, typography, motion curves).

---

## 7. Package ID & Release Compatibility Strategy

- **Hallyu TV APK:**
  - Package ID: `app.hallyutv.dev` (preserves established distribution package ID for existing TV users).
  - Launcher: `android.intent.category.LEANBACK_LAUNCHER` + `android.software.leanback` (optional).
  - Screen Orientation: `landscape`.
- **Hallyu Mobile APK:**
  - Package ID: `app.hallyu.mobile` (distinct identity; avoids conflict and enables side-by-side installation).
  - Launcher: Standard `android.intent.category.LAUNCHER`.
  - Screen Orientation: `portrait` (sensor-landscape enabled for player).
- **Side-by-side Guarantee:** Different package names allow both APKs to coexist on Android devices and TV boxes with zero conflict.

---

## 8. Proposed Two-APK Build Strategy

1. **Expo Dynamic Configuration (`app.config.js`):**
   - Evaluates `process.env.APP_VARIANT` (`tv` or `mobile`, defaulting to `mobile`).
   - Dynamically injects name, slug, package ID, orientation, plugins, and variant metadata.
2. **Package Scripts:**
   - `build:mobile`: `APP_VARIANT=mobile expo prebuild -p android --no-install && cd android && ./gradlew assembleRelease`
   - `build:tv`: `APP_VARIANT=tv expo prebuild -p android --no-install && cd android && ./gradlew assembleRelease`
   - `build:all`: Builds both APKs sequentially.
3. **GitHub Actions CI/CD (`.github/workflows/apk-build.yml`):**
   - Matrix or sequential build of both variants.
   - Produces `hallyu-mobile-release.apk` and `hallyu-tv-release.apk`.
   - Generates release metadata (`mobile-update.json` and `tv-update.json`) and SHA-256 checksums.

---

## 9. Items Requiring Physical Device or Owner Credentials

- **Physical TV Remote Hardware Testing:** Real Bluetooth/IR remote keycodes vary between TV boxes (e.g. Shield TV vs generic AOSP boxes). D-pad navigation uses standard Android KeyEvent mappings.
- **Production Keystore Signing:** CI builds use debug/standard release keys until the owner provides custom upload keys in GitHub Secrets.
