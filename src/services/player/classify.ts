/**
 * Player error classification — pure, unit-testable. Input is the raw error
 * string surfaced by expo-video's statusChange (or a transport-level failure).
 * Never embeds signed URLs in the produced messages.
 */

export type PlayerErrorKind =
  | "expired"
  | "cdn"
  | "network"
  | "format"
  | "decoder"
  | "empty_response"
  | "buffering_timeout"
  | "unknown";

export function classifyPlayerError(raw: string | null | undefined): PlayerErrorKind {
  const m = (raw ?? "").toLowerCase();
  if (!m) return "unknown";
  if (m.includes("buffering") || m.includes("stall")) return "buffering_timeout";
  // 426 is the CDN's header-profile rejection — a CDN failure, not an expired link.
  if (m.includes("426")) return "cdn";
  if (m.includes("403") || m.includes("401") || m.includes("expired") || m.includes("sign") || m.includes("forbidden")) {
    return "expired";
  }
  if (/\b4\d{2}\b/.test(m) || /\b5\d{2}\b/.test(m) || m.includes("http") || m.includes("cdn") || m.includes("426")) {
    return "cdn";
  }
  if (m.includes("decode") || m.includes("codec") || m.includes("unsupported") || m.includes("nosuitable") || m.includes("no decoder")) {
    return "decoder";
  }
  if (m.includes("format") || m.includes("container") || m.includes("invalid") || m.includes("empty") || m.includes("no stream")) {
    return "format";
  }
  if (m.includes("network") || m.includes("offline") || m.includes("internet") || m.includes("unable to resolve") || m.includes("timed out") || m.includes("timeout") || m.includes("connection")) {
    return "network";
  }
  return "unknown";
}

const MESSAGES: Record<PlayerErrorKind, string> = {
  expired: "This stream link expired. A fresh link is being fetched.",
  cdn: "The video server refused the request. It may be busy — try again shortly.",
  network: "The network connection dropped. Check your connection and retry.",
  format: "The media response was empty or unreadable.",
  decoder: "This device could not decode this video format.",
  empty_response: "The server returned no video data for this source.",
  buffering_timeout: "The stream is taking too long to buffer.",
  unknown: "Something interrupted this stream.",
};

/** Clear user-facing sentence for a classified failure. */
export function playerErrorMessage(kind: PlayerErrorKind): string {
  return MESSAGES[kind];
}
