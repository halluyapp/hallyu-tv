import { palette, radius, spacing, posterRatio, gradients } from "@/design-system/tokens";
import { CatalogueItem } from "@/types/provider";
import { Poster, initialsFor } from "@/components/ui/Poster";
import React, { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GlassPanel } from "./GlassPanel";
import { Star, Tv, Film } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

interface PosterCardProps {
  item: CatalogueItem;
  width?: number;
  onPress: () => void;
}

/** 3D Spatial Poster Card with liquid glass badges & specular sheen. */
export const PosterCard = memo(function PosterCard({ item, width, onPress }: PosterCardProps) {
  const { width: screenW } = useWindowDimensions();
  const w = width ?? Math.round((screenW - spacing.xl * 2 - spacing.md * 2) / 3);
  const height = Math.round((w * posterRatio.height) / posterRatio.width);
  const isSeries = item.mediaType === "series";

  return (
    <GlassPanel
      onPress={onPress}
      style={{ width: w, marginRight: spacing.md }}
      pressedScale={0.94}
      focusedScale={1.06}
      sound="tap"
      variant="card"
      hasSheen={false}
    >
      <View style={{ height, borderRadius: radius.card, overflow: "hidden", backgroundColor: palette.surface, position: "relative" }}>
        <Poster
          uri={item.posterUrl}
          style={StyleSheet.absoluteFill}
          initials={initialsFor(item.name)}
          play
          playColor="#FFFFFF"
        />

        {/* Ambient bottom gradient inside poster */}
        <LinearGradient
          colors={["transparent", "rgba(4, 6, 10, 0.2)", "rgba(4, 6, 10, 0.85)"]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Floating Glass Rating Badge */}
        {item.rating ? (
          <View style={styles.ratingBadge}>
            <Star size={10} color="#FBBF24" fill="#FBBF24" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        ) : null}

        {/* Floating Media Type Glass Pill */}
        <View style={styles.typeBadge}>
          {isSeries ? (
            <Tv size={10} color={palette.textSecondary} />
          ) : (
            <Film size={10} color={palette.textSecondary} />
          )}
          <Text style={styles.typeText}>{isSeries ? "Series" : "Movie"}</Text>
        </View>

        {/* Glass Specular Glint along the curved top edge */}
        <LinearGradient
          colors={gradients.glassSheenSoft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.posterGlint}
          pointerEvents="none"
        />
      </View>

      <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}>
        <Text numberOfLines={1} style={styles.title}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[item.year, isSeries ? "Series" : "Movie"].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </GlassPanel>
  );
});

export function SkeletonFill() {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.surfaceRaised }]} />;
}

const styles = StyleSheet.create({
  title: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: -0.2,
  },
  meta: {
    color: palette.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  ratingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(14, 20, 30, 0.75)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  typeBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(14, 20, 30, 0.75)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  typeText: {
    color: palette.textSecondary,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  posterGlint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
  },
});
