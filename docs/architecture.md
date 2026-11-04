# Architecture

Hallyu TV is a standalone React Native (TypeScript, Expo SDK 54) streaming
client for phones/tablets and Android TV. It has **no application backend**:
no accounts, no Supabase, no Rork auth, no pairing service, and no media proxy.
The only remote service is the public Zarhosting catalogue/stream API.

## Layers

```text
src/
  config/branding.ts        Hallyu TV identity
  design-system/tokens.ts   "Obsidian Glass / Emberlight" visual tokens
  types/provider.ts         Provider contract types + runtime catalogue parsing
  types/library.ts          Local watchlist/progress types
  services/provider/        Zarhosting client, adapter, stream normalization
  services/localLibrary.ts  Device-local AsyncStorage library persistence
  services/downloads/       Direct download state machine (native + JS engines)
  services/subtitles/       SRT/VTT parsing + cue lookup
  state/LibraryContext.tsx  Local watchlist + continue watching
  components/ui/            Glass UI kit and states
  navigation/               Mobile tabs + independent TV stack
  screens/                  Onboarding, Home, Discover, Details, Player,
                            Downloads, My Space, TV Home/Search
plugins/
  withHallyuDownloader.js   Android system DownloadManager native module
  withAndroidTvSupport.js   Leanback launcher + no-touchscreen manifest support
scripts/                    verify-provider.mjs, cdn-probe.mjs, icon generator
```

## Independence model

- Mobile and TV each run the same provider client and keep their own local
  library/downloads. There is no cross-device sync or pairing.
- TV uses `Platform.isTV` to select a 10-foot navigator with remote-focusable
  cards. The Android manifest plugin adds a leanback launcher category and
  marks touchscreen as not required.
- First-run mobile onboarding is stored locally. There is no welcome/auth gate.

## Data flow

1. Catalogue/search/detail come from Zarhosting public endpoints.
2. Play/download resolves `GET /stream/{subject_id}?detail_path=&se=&ep=` with
   the required headers, normalizes sources, and selects a full-length source.
3. Playback uses `expo-video` directly against the returned HTTPS CDN URL with
   the shared media headers. Recovery re-resolves fresh URLs; there is no proxy
   fallback.
4. Downloads use Android `DownloadManager` when available, otherwise
   `expo-file-system`. Files are verified on disk before becoming playable.
5. Watchlist/progress are persisted to AsyncStorage on the device.
6. UI sounds are short bundled MP3s played through expo-audio players that
   live in the SoundProvider; the sound preference is device-local and
   never affects video/audio playback of titles.

## Key invariants

- Playback requires an explicit Play/episode tap; nothing auto-plays on launch.
- Movies resolve with `se=0&ep=0`; series pass the selected season/episode.
- Preview/trailer/sample sources are never selected.
- Default quality is data-conscious: requested quality, else verified 360p,
  else lowest verified full-length quality.
- Downloads only accept progressive MP4 sources, never HLS/DASH manifests.
- No secrets or environment variables are required to build or run the app.

## CI

- `apk-build.yml` — install, unit tests, typecheck, Expo prebuild, Gradle
  release APK, artifact upload.
- `provider-verify.yml` — live Zarhosting contract check using the app's shared
  normalization/selection rules.
