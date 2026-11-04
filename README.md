# Hallyu TV

A standalone React Native / Expo streaming client for phones, tablets, and
Android TV. It talks directly to the public Zarhosting catalogue/stream API.
There is no app backend, no account system, no phone-to-TV pairing, and no media
proxy. Mobile and TV each keep their own local watchlist, resume positions, and
downloads.

## Features

- Browse, search, and open title details from the Zarhosting catalogue.
- Play movies and series with the existing `expo-video` player.
- Select seasons/episodes, quality, and subtitle tracks (SRT/WebVTT).
- Resume playback from device-local progress.
- Download full-length progressive MP4 sources for offline viewing.
  - Android uses the system `DownloadManager` through a small Kotlin module.
  - Other platforms fall back to `expo-file-system`.
- Android TV leanback launcher with a dedicated 320×180 banner and a
  purpose-built 10-foot experience (its own Home, Details, Downloads, Search and
  player chrome — none of them a scaled-up phone screen).
- **"Deep Blue Liquid Glass"** design system: midnight-navy environment,
  electric-blue light source, icy-cyan highlight. Six documented material
  variants, a luminous edge on every glass surface, and real blur on exactly two
  of them (tab bar, player chrome) — see `docs/design-system.md`.
- Sora display face for titles (bundled, OFL) with the system font for body copy.
- Capability-based rendering: `high` / `standard` / `low` tiers read from real
  device memory, not the Android version, and decide blur, ambience, parallax and
  list window sizes.
- Six bundled interface tones (tap, confirm, play swell, tab tick, soft error,
  download-complete bell) plus a quiet focus tick for TV, driven by a
  `SoundProvider`/`useSound()` API; a title's own audio is never touched.

## Provider contract

Stream resolution always uses:

```http
GET https://movieapi.zarhosting.dpdns.org/api/public/v1/stream/{subject_id}
    ?detail_path={slug}&se={season}&ep={episode}
User-Agent: Mozilla/5.0
Referer: https://moviebox.ph/
Accept: application/json
```

Movies use `se=0&ep=0`. Direct CDN media requests use the shared media headers
(`User-Agent`, `Referer`, `Origin`). See [docs/provider-integration.md](docs/provider-integration.md).

## Requirements

- Bun (or npm) and Node.js
- For Android native builds: JDK 17 and the Android SDK (via Android Studio or CI)

No environment variables or secrets are required.

## Develop

```bash
bun install
bun run start          # Expo dev server
bun run android        # Build/run on a connected Android device/emulator
```

## Verify

```bash
bun test               # Unit/contract tests
bun run typecheck      # TypeScript strict check
bun run verify:provider # Live Zarhosting API contract check
```

## Build an Android APK

```bash
bunx expo prebuild -p android --no-install
cd android
./gradlew assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.
CI (`.github/workflows/apk-build.yml`) runs tests, typecheck, prebuild, and the
Gradle release build, then uploads the APK artifact.

## Project layout

- `src/design-system` — tokens, materials, gradients, typography, motion
- `src/components/ui` — poster, states, buttons, blur surface, glass primitives
- `src/components/tv` — TV tile, focusable control
- `src/services/provider` — Zarhosting client, cache, stream normalization, selection
- `src/services/downloads` — offline download state machine
- `src/services/localLibrary.ts` — device-local watchlist/progress
- `src/screens` — mobile and TV screens
- `plugins` — Android downloader + Android TV manifest config plugins
- `docs` — architecture, provider integration, downloads design, cleanup audit

## Notes

- Playback never auto-starts on launch; it requires an explicit Play/episode tap.
- Downloads only accept progressive MP4 sources, never HLS/DASH manifests.
- The app does not store or log signed CDN URLs.
- Catalogue reads (`/home`, `/detail/{slug}`) are cached with
  stale-while-revalidate and de-duplicated; search and stream URLs are never
  cached, because signed stream URLs expire.
