import { palette } from "@/design-system/tokens";
import React, { memo, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";

interface PosterProps {
  uri: string | null | undefined;
  /** Explicit size styles (width/height) from the caller. */
  style: StyleProp<ImageStyle>;
  /** Two-letter fallback art when there is no image or it fails. */
  initials?: string;
  /** Optional thumb-hash / blur placeholder shown while loading. */
  placeholder?: string | null;
}

/**
 * The one image primitive for artwork. expo-image backs this with Glide on
 * Android (disk caching, downsampled decodes, view recycling), which is the
 * main win on low-end devices. Falls back to designed initial art — never a
 * broken-image icon.
 */
export const Poster = memo(function Poster({ uri, style, initials, placeholder }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;

  return showImage ? (
    <ExpoImage
      source={{ uri: uri as string }}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      style={[style, { backgroundColor: palette.surfaceRaised }]}
      contentFit="cover"
      cachePolicy="disk"
      recyclingKey={uri ?? undefined}
      transition={120}
      onError={() => setFailed(true)}
    />
  ) : (
    <View style={[style, styles.fallback]}>
      {initials ? <Text style={styles.initials}>{initials}</Text> : null}
    </View>
  );
});

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
  },
  initials: {
    color: palette.textMuted,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
