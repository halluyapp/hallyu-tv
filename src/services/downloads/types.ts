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

export interface DownloadJob extends DownloadRequest {
  id: string;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number | null;
  createdAt: number;
  partPath: string;
  finalPath: string;
  failureReason: string | null;
}
