# Provider Integration

Base URL: `https://movieapi.zarhosting.dpdns.org/api/public/v1` (public, no key).

## Required stream resolver

```http
GET /stream/{subject_id}?detail_path={slug}&se={season}&ep={episode}
User-Agent: Mozilla/5.0
Referer: https://moviebox.ph/
Accept: application/json
```

Example:

```bash
curl -sG "https://movieapi.zarhosting.dpdns.org/api/public/v1/stream/56988683026712168" \
  --data-urlencode "detail_path=attack-on-titan-hindi-kGWQOIx0d4" \
  --data-urlencode "se=1" \
  --data-urlencode "ep=1" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Referer: https://moviebox.ph/" \
  -H "Accept: application/json"
```

Movies use `se=0&ep=0`. Series use the selected season and episode. The app
builds this path in one place: `streamEndpoint()` in
`src/services/provider/streams.ts`, and sends it through `providerFetch()` with
`PROVIDER_API_HEADERS` from `src/services/provider/client.ts`.

## Endpoints used

| Endpoint | Purpose |
| --- | --- |
| `GET /home` | Catalogue rails/banner |
| `GET /search?q=&page=` | Paginated search |
| `GET /detail/{slug}` | Title detail, seasons, cast |
| `GET /stream/{subject_id}?detail_path=&se=&ep=` | Playable sources |
| `GET /stream/{subject_id}/captions?detail_path=&se=&ep=` | Caption tracks |

## Stream normalization

`src/services/provider/streams.ts` is the single normalization + selection
module used by the app, verifier, and tests.

- Accepts top-level or `data`-nested payloads, and `sources` or `streams` arrays.
- Source URL fields: `url`, `playback_url`, `file`. Only valid HTTPS URLs survive.
- Quality fields: `resolution`, `resolutions`, `quality`, `label`, `quality_value`.
- Size fields: `size_bytes` (bytes), `size_mb` (MB), or ambiguous `size`
  (legacy heuristic: small numbers are MB). Malformed metadata never rejects an
  otherwise-valid URL.
- Duration fields: `duration`, `duration_sec` (seconds).
- `has_resource: false` yields no selectable sources.
- Top-level `hls`/`dash` URL arrays are normalized as manifest sources for
  playback, but are never offered as offline downloads.
- Duplicate URLs are removed.

### Full-length rule and selection

- Labels containing `mobile native`, `preview`, `trailer`, `sample`, or `clip`
  are previews and never selectable.
- A source is verified full-length when duration > 300s OR size > 50MB. Missing
  metadata leaves it unverified; unverified sources are ranked after verified
  ones and are only used when no verified source exists.
- Default selection: requested quality if offered, else verified 360p, else the
  lowest verified full-length quality. The app never defaults to the highest
  quality.
- Downloads additionally require progressive MP4 (`selectDownloadSource`).

## Media access

- API JSON requests use the exact required headers above.
- Direct CDN media/caption transfers use `PROVIDER_MEDIA_HEADERS`:
  `User-Agent: Mozilla/5.0`, `Referer: https://moviebox.ph/`,
  `Origin: https://moviebox.ph`.
- The Android native downloader mirrors those media headers exactly; tests
  fail if the plugin and client drift.
- There is no server-side media proxy. If a direct CDN transfer fails, the app
  re-resolves a fresh URL and tries another selectable source, then surfaces a
  clear error. `scripts/cdn-probe.mjs` can diagnose direct CDN behavior.

## Caching

`src/services/provider/cache.ts` wraps catalogue reads only:

| Read | Fresh for | Stale-while-revalidate window |
| --- | --- | --- |
| `/home` | 90 s | 30 min |
| `/detail/{slug}` | 10 min | 6 h |

- Identical in-flight requests are de-duplicated (one network call, N awaiters).
- Stale entries are served immediately while a background refresh runs; a failed
  refresh keeps the stale value rather than blanking the screen.
- **Search is never cached** — results must reflect the query the user just
  typed.
- **Stream URLs are never cached** — signed CDN URLs expire, so every play or
  retry resolves fresh.

## Subtitles

Caption tracks are fetched from the provider, then the selected track is
downloaded directly and parsed as SRT or WebVTT. Cues are rendered as a styled
overlay synced to the player clock, with a user-tunable delay. Positive delay
values delay subtitles; negative values advance them.

## Failure handling

- Expired/refused stream URLs: bounded recovery re-resolves fresh sources and
  preserves playback position.
- Malformed payloads: adapter throws typed `ProviderError`s.
- Missing captions: the player keeps playing and shows a retryable subtitle
  error instead of failing playback.
