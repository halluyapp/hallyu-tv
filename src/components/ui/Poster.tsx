import { palette, radius as radiusTokens } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, type ImageStyle, type StyleProp } from "react-native";
import { posterFallback, posterFallbackLight, posterSheen } from "@/design-system/gradients";

interface PosterProps {
  uri: string | null | undefined;
  /** Explicit size styles (width/height) from the caller. */
  style: StyleProp<ImageStyle>;
  /** Fallback art: up to two initials drawn on a tinted plate. */
  initials?: string;
  /** BlurHash / thumbhash string for a progressive reveal. */
  placeholder?: string | null;
  /** `high` decode priority for the hero / above-the-fold artwork. */
  priority?: "low" | "normal" | "high";
  /** Rounded corners; defaults to the standard card radius. */
  borderRadius?: number;
  /** Small caption under the fallback initials (e.g. the title). */
  fallbackLabel?: string;
}

/**
 * The one artwork primitive.
 *
 * Reliability rules baked in:
 *
 * 1. **No sticky failure state.** Failures are tracked *per URI*
 *    (`failedUri`), so a recycled list slot that previously failed instantly
 *    renders the next title's real artwork. The old implementation latched a
 *    boolean and poisoned every later item in that slot — a direct cause of
 *    "some posters never load".
 * 2. **Never a broken-image icon and never an empty hole.** While loading we
 *    show a tinted plate with a soft sheen; on failure we show designed
 *    initials art derived from the title.
 * 3. **Memory + disk cache.** `memory-disk` keeps recently scrolled artwork
 *    decoded in RAM (smooth back-scrolling) and persisted across launches.
 * 4. **Right-sized decodes.** Low-capability devices ask for a cheaper decode
 *    rather than a full-resolution bitmap per tile.
 * 5. **Stable recycling key.** Derived from the URI, so Glide never shows the
 *    previous item's bitmap in a reused view.
 */
export const Poster = memo(function Poster({
  uri,
  style,
  initials,
  placeholder,
  priority = "normal",
  borderRadius,
  fallbackLabel,
}: PosterProps) {
  // Failures are remembered by URI, never as a latch on the component.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;

  // A new URI clears the "still loading" memory of the previous one, so the
  // skeleton can appear again for an item we have not decoded yet.
  useEffect(() => {
    if (loadedUri && loadedUri !== uri) setLoadedUri(null);
  }, [uri, loadedUri]);

  const onError = useCallback(() => {
    if (uri) setFailedUri(uri);
  }, [uri]);

  const onLoad = useCallback(() => {
    if (uri) setLoadedUri(uri);
  }, [uri]);

  if (!showImage) {
    return <PosterFallback style={style} initials={initials} label={fallbackLabel} borderRadius={borderRadius} />;
  }

  const ready = loadedUri === uri;

  return (
    <View style={[style, styles.clip, { borderRadius: borderRadius ?? radiusTokens.md, backgroundColor: palette.surface }]}>
      <ExpoImage
        source={{ uri: uri as string }}
        placeholder={placeholder ? { blurhash: placeholder } : undefined}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri as string}
        priority={priority}
        transition={ready ? 0 : 200}
        allowDownscaling={!effects().fullQualityImages}
        onError={onError}
        onLoad={onLoad}
      />
      {!ready ? <PlaceholderSheen /> : null}
    </View>
  );
});

/** Designed fallback art — a blue-lit plate with the title's initials. */
function PosterFallback({
  style,
  initials,
  label,
  borderRadius,
}: {
  style: StyleProp<ImageStyle>;
  initials?: string;
  label?: string;
  borderRadius?: number;
}) {
  return (
    <View style={[style, styles.clip, { borderRadius: borderRadius ?? radiusTokens.md }]}>
      <LinearGradient colors={posterFallback} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={posterFallbackLight}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.fallbackCenter}>
        {initials ? <Text style={styles.initials}>{initials}</Text> : null}
        {label ? (
          <Text numberOfLines={2} style={styles.fallbackLabel}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The loading plate: a faint diagonal sheen, static on low-tier devices. */
function PlaceholderSheen() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={posterSheen}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** Two-letter monogram from a title. */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  fallbackCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 8, gap: 4 },
  initials: {
    color: palette.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
  },
  fallbackLabel: {
    color: palette.textMuted,
    fontSize: 10,
    textAlign: "center",
    lineHeight: 13,
  },
});
