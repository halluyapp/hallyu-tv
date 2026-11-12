import { palette } from "@/design-system/tokens";
import React, { memo, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Play } from "lucide-react-native";

interface PosterProps {
  uri: string | null | undefined;
  /** Explicit size styles (width/height) from the caller. */
  style: StyleProp<ImageStyle>;
  /** Two-letter fallback art when there is no image or it fails. */
  initials?: string;
  /** Optional thumb-hash / blur placeholder shown while loading. */
  placeholder?: string | null;
  /** When true, shows a play button overlay in the bottom-right corner. */
  play?: boolean;
  /** Colour of the play button glyph. Defaults to white. */
  playColor?: string;
}

/**
 * The one image primitive for artwork. expo-image backs this with Glide on
 * Android (disk caching, downsampled decodes, view recycling), which is the
 * main win on low-end devices. Falls back to designed initial art — never a
 * broken-image icon.
 */
export const Poster = memo(function Poster({
  uri,
  style,
  initials,
  placeholder,
  play = false,
  playColor = "#FFFFFF",
}: PosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;

  return (
    <View style={[style, { position: "relative", overflow: "hidden" }]}>
      {showImage ? (
        <ExpoImage
          source={{ uri: uri as string }}
          placeholder={placeholder ? { uri: placeholder } : undefined}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          cachePolicy="disk"
          recyclingKey={uri ?? undefined}
          transition={120}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          {initials ? <Text style={styles.initials}>{initials}</Text> : null}
        </View>
      )}

      {play ? (
        <View
          style={[
            styles.playWrap,
            { backgroundColor: playColor === "#FFFFFF" ? "rgba(0,0,0,0.55)" : "transparent" },
          ]}
          pointerEvents="box-none"
        >
          <Play size={20} color={playColor} fill={playColor} style={{ marginLeft: 4 }} />
        </View>
      ) : null}
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
  playWrap: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 5,
  },
});
