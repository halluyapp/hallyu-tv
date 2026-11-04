# Downloads Design

Downloads are direct-to-device. There is no account backend and no media proxy.
Jobs are persisted locally and re-resolve fresh Zarhosting URLs on retry.

## Two engines

| | native (Android default) | js (fallback) |
| --- | --- | --- |
| Transfer owner | System `DownloadManager` via the `HallyuDownloader` Kotlin module injected by `plugins/withHallyuDownloader.js` | `expo-file-system/legacy` resumable task |
| Background | Continues while the app is backgrounded/closed; system notification | Only while the OS lets the JS task run |
| Pause | Not available (DownloadManager cannot pause) | Yes |
| Restart behavior | Reconciled by polling the system on hydrate | Interrupted jobs become failed/retryable |
| Verification | Actual file size + MP4 `ftyp` signature before promotion | `.part` size + signature, then atomic rename |

The native engine is used automatically when the Kotlin module is present.
Everywhere else the JS engine keeps working.

## State machine

`queued → connecting → downloading → verifying → completed`

Side states: `resolving`, `waiting_for_network`, `paused` (JS only), `failed`,
`cancelled`. The registry is persisted to AsyncStorage on every transition,
with serialized writes so rapid updates cannot land out of order.

- Hydration is a single shared promise; enqueue/pump wait for it, preventing
  duplicate jobs or lost registry entries during startup.
- Concurrency is capped at 2 active transfers.
- Free-disk headroom is checked before both engines start (256 MB reserve).
- Retrying a failed/cancelled job always re-resolves a fresh signed URL,
  preferring the same quality and falling back to the default download rule.
- Only progressive MP4 sources are downloadable; HLS/DASH manifests are rejected.

## Byte flow (native engine)

1. JS hands the system a fresh CDN URL. The Kotlin module sends the exact
   `PROVIDER_MEDIA_HEADERS` used by the player.
2. The system writes to app-private external storage:
   `Android/data/<package>/files/hallyu-dl/<key>.mp4`.
3. Progress is polled once per second while the app is open; zero-progress
   stalls are bounded.
4. On `STATUS_SUCCESSFUL`, JS verifies the actual file on disk (size within
   tolerance of the provider-reported size, plus MP4 signature) before marking
   the job completed. The local path is stored and played as a `file://` URI.

## Byte flow (JS engine)

1. `createDownloadResumable` writes to a `.part` file under
   `documentDirectory/downloads/`.
2. Progress callbacks update bytes received.
3. On completion the `.part` file is validated and atomically renamed.
4. Playback uses the local `file://` URI.

## Shared guarantees

- One download per title/season/episode. Native and JS keys are stable by
  subject id, so retries replace rather than stack duplicates.
- File names include the subject id to avoid collisions between titles with the
  same display name.
- System failure reasons are mapped to plain sentences without URLs/tokens.
- Deleting a job removes the file and any dangling part file.
- Files are device-local and are never uploaded or synced.
