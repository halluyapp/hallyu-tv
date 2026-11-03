import type { StreamSource } from "@/types/provider";

export type DownloadState =
  | "queued"
  | "resolving"
  | "connecting"
  | "downloading"
  | "paused"
  | "waiting_for_network"
  | "retrying"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadRequest {
  subjectId: string;
  detailPath: string;
  season: number;
  episode: number;
  title: string;
  posterUrl: string | null;
  mediaType: "movie" | "series";
  source: StreamSource;
  expectedBytes: number | null;
}

/** "native" = system DownloadManager (background-safe, no pause); "js" = in-app transfer. */
export type DownloadEngine = "native" | "js";

export interface DownloadJob extends DownloadRequest {
  id: string;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number | null;
  createdAt: number;
  partPath: string;
  finalPath: string;
  failureReason: string | null;
  /** Which engine owns the bytes. Persisted so restarts reconcile correctly. */
  engine: DownloadEngine;
  /** Native engine only: absolute file path reported by the system on success. */
  nativeKey?: string;
  /** Fresh-source retries already attempted (persisted so the proxy fallback survives restarts). */
  freshRetries?: number;
  /** True when the current source URL points at the media proxy instead of the CDN. */
  viaProxy?: boolean;
}
