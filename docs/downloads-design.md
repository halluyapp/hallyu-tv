# Downloads Design

## State machine

`queued → connecting → downloading → verifying → completed`
with `paused`, `waiting_for_network`, `retrying`, `failed`, `cancelled` side
states. The registry (job list) is persisted to AsyncStorage on every
transition; jobs interrupted by an app restart come back as `failed` and are
retryable (signed URLs are re-resolved on retry — they expire).

## Byte flow

1. `expo-file-system/legacy` `createDownloadResumable` writes to a `.part`
   file under `documentDirectory/downloads/`.
2. Progress callbacks update bytes received (only truthy totals are stored).
3. On completion the `.part` file is validated (exists, ≥1 KiB) and atomically
   renamed to its final name — a download is only `completed` after the file
   is verified on disk.
4. Playback uses the local `file://` URI; the player is fed the offline source
   like any other quality.

## Honest limitations (documented, not hidden)

- **No OS-level background transfer service**: expo-file-system transfers
  continue while backgrounded only as long as the OS allows the JS task to
  run. True background downloads with system notifications require a native
  transfer module (WorkManager/DownloadManager) — future work.
- Resume uses the resumable API only while the signed URL remains valid;
  expired URLs trigger a full re-resolve + restart.
- Concurrency is capped at 2 simultaneous downloads (see `MAX_CONCURRENT_DOWNLOADS`).

## Device-tied storage

Files live in the app's private document directory, never synced or uploaded.
Deleting a job removes the file; unlinking an account does not delete local
files but blocks further signed-in features.
