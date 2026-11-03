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

## Media access

- Sources are progressive MP4 (360p/480p/1080p) with size/duration/codec metadata.
- Requests must carry browser-like `User-Agent`, `Referer: https://www.moviebox.ph/`
  and `Origin` headers (see `services/provider/client.ts` → `PROVIDER_MEDIA_HEADERS`).
- CDN hosts are IP-sensitive; playback must be confirmed on-device. The CI
  verifier (`scripts/verify-provider.mjs`) checks metadata and descriptors only.

## Subtitles

SRT-first with side-loaded rendering: tracks are fetched, parsed
(`services/subtitles/srt.ts`) and drawn as an overlay synced to the player
clock, with a user-tunable delay. `srtToVtt` is available for future native
track attachment.

## Failure handling

- Expired stream URLs: player retry re-resolves fresh sources and preserves
  position.
- Malformed payloads: adapter normalizes and throws typed `ProviderError`s.
