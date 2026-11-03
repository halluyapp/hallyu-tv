import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import React from "react";
import { StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { WifiOff, CloudOff, RefreshCw } from "lucide-react-native";
import { Button } from "./Button";

/** Skeleton shimmer block for catalogue loading. */
export function Skeleton({ width, height, style }: { width: number | `${number}%`; height: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width, height, borderRadius: radius.md, backgroundColor: palette.surfaceRaised }, style]} />;
}

export function SkeletonRail({ itemWidth = 110, count = 4 }: { itemWidth?: number; count?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <Skeleton width={itemWidth} height={Math.round((itemWidth * 3) / 2)} />
          <Skeleton width={itemWidth * 0.7} height={10} style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <Text style={[typeScale.headline, styles.title]}>{title}</Text>
      <Text style={[typeScale.caption, styles.message]}>{message}</Text>
    </View>
  );
}

export function OfflineBanner() {
  return (
    <View style={styles.offline}>
      <WifiOff size={14} color={palette.warning} />
      <Text style={styles.offlineText}>You're offline — browsing cached content</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <CloudOff size={28} color={palette.textMuted} />
      <Text style={[typeScale.headline, styles.title]}>Something went wrong</Text>
      <Text style={[typeScale.caption, styles.message]}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" icon={<RefreshCw size={16} color={palette.textPrimary} />} onPress={onRetry} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  title: { color: palette.textPrimary, textAlign: "center" },
  message: { color: palette.textSecondary, textAlign: "center", lineHeight: 19 },
  offline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(229,179,94,0.12)",
    borderColor: "rgba(229,179,94,0.3)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineText: { color: palette.warning, fontSize: 12, fontWeight: "600" },
});
