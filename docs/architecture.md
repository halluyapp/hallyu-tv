# Architecture

Hallyu TV is a standalone React Native (TypeScript, Expo SDK 54) streaming
client for phones/tablets and Android TV. It has **no application backend**:
no accounts, no Supabase, no Rork auth, no pairing service, and no media proxy.
The only remote service is the public Zarhosting catalogue/stream API.

## Layers

```text
src/
  config/branding.ts        Hallyu TV identity
  design-system/           "Deep Blue Liquid Glass": tokens, gradients,
                            materials, typography, motion, layout
  types/provider.ts         Provider contract types + runtime catalogue parsing
  types/library.ts          Local watchlist/progress types
  services/provider/        Zarhosting client, cache, adapter, stream normalization
  services/localLibrary.ts  Device-local AsyncStorage library persistence
  services/downloads/       Direct download state machine (native + JS engines)
  services/subtitles/       SRT/VTT parsing + cue lookup
  state/LibraryContext.tsx  Local watchlist + continue watching
  hooks/                    Device capability tier (high/standard/low),
                            reduced motion, debounced value
  components/ui/            Glass UI kit, blur surface, states
  components/tv/            TV tile + focus surface
  navigation/               Mobile tabs + independent TV stack
  screens/                  Onboarding, Home, Discover, Search, Details, Player,
                            Downloads, My Space and the TV variants
plugins/
  withHallyuDownloader.js   Android system DownloadManager native module
  withAndroidTvSupport.js   Leanback launcher, no-touchscreen manifest support,
                            and TV banner drawable generation
scripts/                    verify-provider.mjs, cdn-probe.mjs, icon generator
```

## Independence model

- Mobile and TV each run the same provider client and keep their own local
  library/downloads. There is no cross-device sync or pairing.
- TV uses `Platform.isTV` to select a 10-foot navigator with remote-focusable
  cards. The Android manifest plugin adds a leanback launcher category, marks
  touchscreen as not required, and writes `res/drawable/tv_banner.png` that the
  manifest's `android:banner` points at.
- First-run mobile onboarding is stored locally. There is no welcome/auth gate.

## Data flow

1. Catalogue/search/detail come from Zarhosting public endpoints. Catalogue
   reads are cached stale-while-revalidate in memory and de-duplicated;
   search results and stream URLs are never cached.
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
- Player state lives in a guard with a token; nothing touches the native player
  after release, and the source object is never part of a hook dependency.

## CI

- `apk-build.yml` — install, unit tests, typecheck, Expo prebuild, Gradle
  release APK, artifact upload.
- `provider-verify.yml` — live Zarhosting contract check using the app's shared
  normalization/selection rules.
