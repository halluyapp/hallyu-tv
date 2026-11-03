# Architecture

Hallyu TV is a React Native (TypeScript, Expo SDK 54) streaming client for
phone/tablet plus Android TV, backed by Supabase as the account control plane.

## Layers

```
src/
  config/branding.ts        Temporary dev branding (no Moviebox marks anywhere)
  design-system/tokens.ts   "Obsidian Glass / Emberlight" tokens — single source of visual truth
  types/provider.ts         Provider contract types
  services/provider/        Provider client + adapter (home/search/detail/stream/captions)
  services/pairing.ts       TV pairing client (edge functions)
  services/downloads/       Download state machine (fs/native isolation, registry persistence)
  services/subtitles/       SRT parsing + cue lookup (side-loaded overlay)
  state/LibraryContext.tsx  Watchlist + watch progress (Supabase, RLS-scoped)
  hooks/useAuth.tsx         Rork Auth (Google, PKCE) with secure-store sessions
  components/               Glass UI kit, auth gate, states
  navigation/               RootNavigator (mobile tabs + TV pairing-first stack)
  screens/                  Onboarding, Welcome, Home, Discover, Details, Player,
                            Downloads, My Space, Devices, TvPair, TvHome
backend/
  migrations/               profiles, watch_progress, watchlist, devices, pairing_sessions
  functions/                pairing-create / pairing-approve / pairing-consume / tv-sync
scripts/                    verify-provider.mjs, verify-backend.mjs, gen-placeholder-icons.mjs
```

## Key invariants

- **Nothing auto-plays after sign-in.** Playback requires an explicit Play tap
  (gate-first), including on TV where focus must be moved and selected.
- **Guests can browse and watch**; library features (watchlist, progress,
  downloads) require sign-in and degrade with a single auth gate.
- **Progress** is saved debounced (10s) and on unmount, upserted on
  `(user, subject, season, episode)`.
- **Pairing** uses single-use 6-digit codes (stored hashed) bound to a TV
  nonce; the TV receives a device session secret once and stores it in secure
  storage. Phones never see TV secrets; TVs never hold user tokens.
- **No secrets in the client.** `.env` contains public-by-design values only
  (anon key, app key, project id).

## CI

- `apk-build.yml` — bun install, typecheck, expo prebuild, Gradle assembleDebug,
  artifact upload.
- `backend-verify.yml` — provider contract checks and Supabase control-plane
  checks (anon-only; verifies RLS denial and edge-function auth rejection).
