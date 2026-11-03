# Downloads Design

## Two engines

| | native (Android default) | js (fallback) |
| --- | --- | --- |
| Transfer owner | System `DownloadManager` (via the `HallyuDownloader` Kotlin module injected at prebuild by `plugins/withHallyuDownloader.js`) | `expo-file-system/legacy` resumable task |
| Background | Keeps downloading while the app is backgrounded or closed; system notification with progress; retries on connectivity changes | Only while the OS lets the JS task run |
| Pause | Not available (DownloadManager cannot pause) | Yes |
| Restart behavior | Reconciled by polling the system — a job finished while closed is marked completed | Interrupted jobs come back as `failed`, retryable |
| Verification | Size within ±2% of the provider-reported size before promotion | `.part` file validated (exists, ≥1 KiB, size tolerance, MP4 `ftyp` signature), then atomically renamed |

The native engine is used automatically when the Kotlin module is present
(Android builds). Everywhere else the JS engine keeps working unchanged.

## State machine

`queued → resolving → connecting → downloading → verifying → completed`
with `waiting_for_network`, `paused` (js engine only), `failed`, `cancelled`
side states. The registry (job list) is persisted to AsyncStorage on every
transition.

- Native mid-flight jobs are reconciled against the system on hydrate —
  they are never guessed to be `failed`, because the system may have kept
  going (or finished) without the app.
- Retrying a failed/cancelled job always re-resolves a fresh signed URL
  (they expire), preferring the same quality and falling back to the same
  default rule playback uses (verified full-length 360p, else lowest).
- A paused JS job whose task no longer exists after a restart goes through
  the same re-resolve path instead of silently doing nothing.

## Byte flow (native engine)

1. JS hands the system a fresh signed URL and the exact media headers the
   player uses (`User-Agent`, `Referer`, `Origin` — kept in sync with
   `PROVIDER_MEDIA_HEADERS` by `tests/downloads.test.ts`).
2. The system writes to `Android/data/<package>/files/hallyu-dl/<key>.mp4`
   (app-private external storage — no storage permission needed).
3. Progress is polled once per second while the app is open; the poll loop
   also guards against indefinite zero-progress stalls.
4. On `STATUS_SUCCESSFUL`, the size is verified against the provider number
   before the job is promoted to `completed`; the absolute local path is
   stored in the registry and played as a `file://` URI.

## Byte flow (js engine)

1. `createDownloadResumable` writes to a `.part` file under
   `documentDirectory/downloads/`.
2. Progress callbacks update bytes received (only truthy totals are stored).
3. On completion the `.part` file is validated and atomically renamed — a
   download is only `completed` after the file is verified on disk.
4. Playback uses the local `file://` URI; the player is fed the offline
   source like any other quality.

## Shared guarantees

- One download per title/season/episode: enqueue is a no-op while a job for
  the same key exists (native keys are stable, so a retry replaces the old
  system job rather than stacking duplicates).
- Concurrency capped at 2 (`MAX_CONCURRENT_DOWNLOADS`).
- Free-disk headroom is checked before starting (256 MB reserve).
- System failure reasons (`COLUMN_REASON`) are mapped to plain sentences
  (`services/downloads/reasons.ts`): storage, refused link, redirects,
  blocked network — retryable ones point at retry, since a fresh URL fixes
  most of them. Messages never contain URLs or tokens.

## Device-tied storage

Files live in the app's private storage (document directory for the js
engine, app-private external files for the native engine), never synced or
uploaded. Deleting a job removes the file; unlinking an account does not
delete local files but blocks further signed-in features.
