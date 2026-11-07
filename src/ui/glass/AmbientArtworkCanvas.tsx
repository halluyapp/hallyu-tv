import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { palette } from "@/design-system/tokens";
import {
  IMAGE_REQUEST_HEADERS,
  markResizeUnsupportedForUrl,
  optimizeImageUrl,
} from "@/services/provider/imageOptimizer";

interface AmbientArtworkCanvasProps {
  imageUri?: string | null;
  /** Stronger colour bleed for hero/detail pages; subtler for dense grids. */
  intensity?: "subtle" | "medium" | "rich";
}

/**
 * Ultra-fast cinema colour-bleed behind Liquid Glass surfaces.
 * Loads a tiny 120px WebP derivative (~2.5 KB) at `priority="low"` with
 * lightweight `blurRadius={16}` so Glide's decoder threads stay 100% free for
 * foreground poster cards while delivering rich hardware cross-fades.
 */
export const AmbientArtworkCanvas = memo(function AmbientArtworkCanvas({
  imageUri,
  intensity = "medium",
}: AmbientArtworkCanvasProps) {
  const [rawFallback, setRawFallback] = useState(false);

  useEffect(() => {
    setRawFallback(false);
  }, [imageUri]);

  const optimized = optimizeImageUrl(imageUri, "ambient");
  const effectiveUri = rawFallback ? (imageUri?.trim() || null) : optimized;

  const topScrim =
    intensity === "rich"
      ? "rgba(5, 8, 14, 0.36)"
      : intensity === "medium"
        ? "rgba(5, 8, 14, 0.58)"
        : "rgba(5, 8, 14, 0.74)";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]} />
      {effectiveUri ? (
        <ExpoImage
          source={{
            uri: effectiveUri,
            headers: IMAGE_REQUEST_HEADERS as Record<string, string>,
          }}
          style={styles.bleedImage}
          contentFit="cover"
          allowDownscaling
          decodeFormat="rgb"
          priority="low"
          blurRadius={16}
          cachePolicy="memory-disk"
          transition={180}
          onError={() => {
            if (!rawFallback && imageUri && optimized !== imageUri.trim()) {
              markResizeUnsupportedForUrl(imageUri);
              setRawFallback(true);
            }
          }}
        />
      ) : (
        <LinearGradient
          colors={["rgba(42, 62, 92, 0.32)", "rgba(92, 48, 38, 0.18)", palette.background]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 0.85 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={[topScrim, "rgba(5, 8, 14, 0.82)", palette.background]}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  bleedImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
  },
});
