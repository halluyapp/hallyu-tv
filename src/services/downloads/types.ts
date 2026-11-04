import type { StreamSource } from "@/types/provider";

export type DownloadState =
  | "queued"
  | "resolving"
  | "connecting"
  | "downloading"
  | "paused"
  | "waiting_for_network"
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
  engine: DownloadEngine;
  nativeKey?: string;
  /** Fresh-source retries already attempted. */
  freshRetries?: number;
}
