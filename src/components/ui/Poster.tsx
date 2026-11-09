import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, Text, View } from "react-native";
import { palette } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import {
  IMAGE_REQUEST_HEADERS,
  type ImageSizeKind,
  markResizeUnsupportedForUrl,
  optimizeImageUrl,
} from "@/services/provider/imageOptimizer";

interface PosterProps {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  initials?: string;
  placeholder?: string | null;
  kind?: ImageSizeKind;
  priority?: "low" | "normal" | "high";
}

/**
 * High-throughput GPU-cached artwork primitive backed by Glide on Android (`expo-image`):
 * 1. Sends Moviebox CDN `Referer` + `User-Agent` headers so requests are never throttled.
 * 2. Requests right-sized WebP thumbnails (~20 KB instead of 2 MB raw posters).
 * 3. Automatically retries the raw original URL if a CDN ever rejects resize params.
 * 4. Uses `allowDownscaling` + `memory-disk` cache for smooth 60fps scrolling.
 */
export const Poster = memo(function Poster({
  uri,
  style,
  initials,
  placeholder,
  kind = "poster",
  priority = "normal",
}: PosterProps) {
  const [useRawFallback, setUseRawFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const profile = usePerformanceProfile();

  useEffect(() => {
    setUseRawFallback(false);
    setFailed(false);
  }, [uri]);

  const optimizedUri = optimizeImageUrl(uri, kind);
  const effectiveUri = useRawFallback ? (uri?.trim() || null) : optimizedUri;
  const showImage = Boolean(effectiveUri) && !failed;

  return showImage ? (
    <ExpoImage
      source={{
        uri: effectiveUri as string,
        headers: IMAGE_REQUEST_HEADERS as Record<string, string>,
      }}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      style={[style, { backgroundColor: palette.surfaceRaised }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      allowDownscaling
      priority={priority}
      recyclingKey={effectiveUri ?? undefined}
      transition={profile.imageTransitionMs}
      onError={() => {
        if (!useRawFallback && uri && optimizedUri !== uri.trim()) {
          markResizeUnsupportedForUrl(uri);
          setUseRawFallback(true);
        } else {
          setFailed(true);
        }
      }}
    />
  ) : (
    <View style={[style, styles.fallback]}>
      <LinearGradient
        colors={["#182235", "#0C121D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {initials ? <Text style={styles.initials}>{initials}</Text> : null}
    </View>
  );
});

/**
 * Pre-warms Glide's memory+disk cache for the exact right-sized WebP URLs used
 * by `<Poster>` so cards paint instantly on scroll without duplicate downloads.
 */
export function prefetchPosterBatch(
  uris: Array<string | null | undefined>,
  kind: ImageSizeKind = "poster",
  limit = 12,
): void {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const raw of uris) {
    const opt = optimizeImageUrl(raw, kind);
    if (!opt || seen.has(opt)) continue;
    seen.add(opt);
    targets.push(opt);
    if (targets.length >= limit) break;
  }
  if (targets.length === 0) return;
  void ExpoImage.prefetch(targets, {
    cachePolicy: "memory-disk",
    headers: IMAGE_REQUEST_HEADERS as Record<string, string>,
  }).catch(() => {});
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
    overflow: "hidden",
  },
  initials: {
    color: palette.textSecondary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
});
