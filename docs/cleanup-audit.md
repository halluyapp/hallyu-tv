# Cleanup Audit

This audit records what was removed, what was preserved, and how the simplified
app was validated. The goal was to remove obsolete backend/auth/pairing/proxy
infrastructure while keeping every feature the active app still needs.

## Removed

### Backend / cloud functions

- `backend/` (Supabase Edge Functions and shared helpers)
  - `pairing-create`, `pairing-approve`, `pairing-consume`
  - `tv-sync`
  - `media-proxy`
  - `_shared/auth.ts`, `backend/types.ts`
- `src/services/supabase.ts`
- `src/services/pairing.ts`
- `src/services/provider/transport.ts` (Rork/media-proxy transport)
- `tests/transport.test.ts`

### Legacy auth / gating / pairing UI

- `src/hooks/useAuth.tsx`
- `src/components/auth/GateProvider.tsx`
- `src/screens/auth/WelcomeScreen.tsx`
- `src/screens/devices/DevicesScreen.tsx`
- `src/screens/tv/TvPairScreen.tsx`
- QR/pairing flows and all phone-to-TV sync code paths

### Configuration / scripts / docs tied to removed services

- `.env.example` and all `EXPO_PUBLIC_*` consumers
- `.github/workflows/backend-verify.yml`
- `scripts/verify-backend.mjs`
- `scripts/gen-placeholder-icons.mjs`
- `STREAMING_APP_MASTER_BUILD_PROMPT.md`

### Dependencies dropped

- `@supabase/supabase-js`
- `expo-camera`, `expo-crypto`, `expo-linking`, `expo-secure-store`, `expo-web-browser`
- `react-native-qrcode-svg`
- `react-native-reanimated` (unused after removing pairing animations)
- `expo-screen-orientation`

### Dead code

- Unused `OfflineBanner` component and styles
- Unused `motionConfig` re-export and motion tokens
- Unused imports/locals (enforced by `noUnusedLocals` / `noUnusedParameters`)

## Preserved / rebuilt

- `expo-video` player (kept; playback recovery and scrubbing fixed)
- Premium design system, UI kit, splash, icons, and branding
- Zarhosting provider client/adapter/stream normalization (rewritten around the
  required `/stream/{subject_id}` contract)
- Subtitle parsing (SRT + WebVTT) and overlay rendering
- Download engine: Android `DownloadManager` Kotlin plugin + JS fallback
- Local library (watchlist + continue watching) moved to AsyncStorage
- Mobile tabs and independent TV navigation
- Icon generator (`scripts/gen-hallyu-icons.mjs`)

## Added

- `plugins/withAndroidTvSupport.js` — leanback launcher, no required touchscreen
- `src/services/localLibrary.ts` + `src/types/library.ts`
- `tests/provider.test.ts`, `tests/localLibrary.test.ts`, `tests/tv-manifest.test.ts`,
  `tests/cleanup.test.ts`
- `.github/workflows/provider-verify.yml`
- `expo-system-ui` (enables dark `userInterfaceStyle`)
- Strict TypeScript flags: `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`

## Validation

- `bun install` — lockfile updated, removed dependencies pruned
- `bun test` — 85 tests pass (provider contract, streams, downloads, subtitles,
  local library, TV manifest, cleanup regression)
- `bun run typecheck` — passes with strict unused checks
- `expo prebuild --platform android --no-install` — generates native project,
  Kotlin downloader module, and leanback manifest entries
- `expo export --platform android` — Metro bundle succeeds
- Gradle release build runs in CI (`.github/workflows/apk-build.yml`); a local
  Gradle APK build requires JDK 17 + Android SDK, which are not installed in this
  workspace.

## Behavioral guarantees after cleanup

- No imports or references remain to Supabase, Rork, pairing, TV sync, media
  proxy, or removed environment variables (enforced by `tests/cleanup.test.ts`).
- Mobile and TV operate independently; no cross-device auth or sync.
- Stream requests always include `detail_path`, `se`, `ep` and the exact required
  headers.
- Downloads resolve fresh Zarhosting URLs and verify files on disk before
  marking them playable.
