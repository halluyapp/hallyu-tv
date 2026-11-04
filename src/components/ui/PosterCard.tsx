import { palette, radius, spacing, posterRatio } from "@/design-system/tokens";
import { CatalogueItem } from "@/types/provider";
import { Poster, initialsFor } from "@/components/ui/Poster";
import React, { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GlassPanel } from "./GlassPanel";
import { Star } from "lucide-react-native";

interface PosterCardProps {
  item: CatalogueItem;
  width?: number;
  onPress: () => void;
}

/** Poster card with designed fallback art (no broken-image icons). */
export const PosterCard = memo(function PosterCard({ item, width, onPress }: PosterCardProps) {
  const { width: screenW } = useWindowDimensions();
  const w = width ?? Math.round((screenW - spacing.xl * 2 - spacing.lg * 2) / 3);
  const height = Math.round((w * posterRatio.height) / posterRatio.width);

  return (
    <GlassPanel onPress={onPress} style={{ width, marginRight: spacing.md }} pressedScale={0.95} sound="tap">
      <View style={{ height, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface }}>
        <Poster uri={item.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(item.name)} />
        {item.rating ? (
          <View style={styles.ratingPill}>
            <Star size={9} color={palette.warning} fill={palette.warning} />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: spacing.sm }}>
        <Text numberOfLines={1} style={styles.title}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
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
  },
  meta: {
    color: palette.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  ratingPill: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(8,10,13,0.72)",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingText: { color: palette.textPrimary, fontSize: 10, fontWeight: "700" },
});
