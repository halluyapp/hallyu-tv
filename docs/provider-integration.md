# Provider Integration

Base URL: `https://movieapi.zarhosting.dpdns.org/api/public/v1` (public, no key).
Reference implementation: github.com/walterwhite-69/Moviebox-API.

## Endpoints used

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /home` | Catalogue sections (rails + banner) | |
| `GET /search?q=&page=` | Paginated search | |
| `GET /detail/{slug}` | Title detail incl. seasons | payload nests under `data.subject` |
| `GET /stream/{subject_id}?detail_path={slug}&se=&ep=` | Stream descriptors | movies use `se=0&ep=0` |
| `GET /stream/{id}/captions` | Caption tracks | |

## Stream normalization (shared rules)

`src/services/provider/streams.ts` is the single normalization + selection
module used by the app, the verifier script and the unit tests. Verified
against live responses (2026-11-03):

- Top-level `{ subject_id, se, ep, has_resource, sources, hls, dash, limited, note }`;
  a payload nested under `data` is also accepted, and `streams` is accepted
  wherever `sources` is.
- Source entries: `{ resolution, format, url, size, duration, codec }` where
  `size` is BYTES as a string and `duration` is seconds. Sizes below 50 000
  are interpreted as megabytes (reference-app heuristic).
- Only valid HTTPS URLs survive; malformed optional metadata never rejects an
  otherwise-valid source. Explicit `has_resource: false` yields no sources.

### Full-length rule and selection

- A source labelled "Mobile Native" (or preview/trailer/sample/clip) is a
  preview and is never selectable.
- A source is full-length when duration > 300 s OR size > 50 MB; it fails
  only when BOTH checks fail; missing metadata marks it unverified (kept,
  ranked after verified sources — never silently discarded).
- Default selection (playback and downloads): requested quality if offered,
  else verified full-length 360p, else the LOWEST verified full-length
  quality. Never defaults to the highest quality.

## Media access

- Sources are progressive MP4 (360p/480p/1080p) with size/duration/codec metadata.
- The single media-header configuration is `PROVIDER_MEDIA_HEADERS`
  (`services/provider/client.ts`): Android Chrome UA, `Referer:
  https://www.moviebox.ph/`, `Origin: https://www.moviebox.ph`.
- Header experiment (2026-11-03, against the same live CDN URL):
  - social-app profile (iPhone Safari UA, `Referer: moviebox.ph`, NO Origin)
    → HTTP 426 Forbidden — the CDN requires `Origin`;
  - current profile (Android Chrome UA + Referer + Origin) → passed the
    header gate and reached rate limiting (HTTP 429 from datacenter IPs).
  Decision: keep the current profile. The social app works through its
  server-side proxy, which rewrites headers server-side — not directly
  comparable.
- CDN media bytes are IP-sensitive: `scripts/cdn-probe.mjs` (dev tool) does a
  small ranged GET and checks status/headers/MP4 signature. From this sandbox
  the CDN answers media requests with 429 — an environment limitation,
  distinct from an app defect. Playback must be confirmed on-device.

## Subtitles

SRT-first with side-loaded rendering: tracks are fetched, parsed
(`services/subtitles/srt.ts`) and drawn as an overlay synced to the player
clock, with a user-tunable delay. `srtToVtt` is available for future native
track attachment.

## Failure handling

- Expired stream URLs: player retry re-resolves fresh sources and preserves
  position.
- Malformed payloads: adapter normalizes and throws typed `ProviderError`s.
