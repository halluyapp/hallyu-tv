import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, Text, View } from "react-native";
import { palette } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";

interface PosterProps {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  initials?: string;
  placeholder?: string | null;
}

/**
 * Single GPU-cached artwork primitive backed by Glide on Android (`expo-image`).
 * Resets error state whenever `uri` changes so recycled FlatList cells never
 * get stuck in fallback mode, and adapts transition timing to hardware RAM.
 */
export const Poster = memo(function Poster({ uri, style, initials, placeholder }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const profile = usePerformanceProfile();

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showImage = Boolean(uri) && !failed;

  return showImage ? (
    <ExpoImage
      source={{ uri: uri as string }}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      style={[style, { backgroundColor: palette.surfaceRaised }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri ?? undefined}
      transition={profile.imageTransitionMs}
      onError={() => setFailed(true)}
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
