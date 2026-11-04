import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { CaptionTrack, StreamSource } from "@/types/provider";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";

/** Bottom sheets for quality and subtitle selection (shared visual system). */

export function PickerSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.sheetBackdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

export function QualityOptions({
  sources,
  activeUri,
  onPick,
}: {
  sources: StreamSource[];
  activeUri: string | null;
  onPick: (s: StreamSource) => void;
}) {
  return (
    <>
      {sources.map((s) => (
        <Pressable
          key={s.url}
          style={[styles.option, s.url === activeUri && styles.optionActive]}
          onPress={() => onPick(s)}
        >
          <Text style={styles.optionTitle}>{s.resolution ?? s.format}</Text>
          <Text style={styles.optionMeta}>
            {[s.codec?.toUpperCase(), s.sizeBytes ? `${(s.sizeBytes / 1_048_576).toFixed(0)} MB` : null, s.format]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </Pressable>
      ))}
      {sources.length === 0 ? <Text style={styles.optionMeta}>No full-length sources for this title.</Text> : null}
    </>
  );
}

export function SubtitleOptions({
  tracks,
  loading,
  error,
  activeId,
  offset,
  onOffset,
  onPick,
  onOff,
  onRetry,
}: {
  tracks: CaptionTrack[] | null;
  loading?: boolean;
  error?: string | null;
  activeId: string | null;
  offset: number;
  onOffset: (v: number) => void;
  onPick: (t: CaptionTrack) => void;
  onOff: () => void;
  onRetry?: () => void;
}) {
  return (
    <>
      <Pressable style={[styles.option, activeId === null && styles.optionActive]} onPress={onOff}>
        <Text style={styles.optionTitle}>Off</Text>
      </Pressable>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={styles.optionMeta}>Loading subtitle tracks…</Text>
        </View>
      ) : null}
      {(tracks ?? []).map((t) => (
        <Pressable
          key={t.id}
          style={[styles.option, activeId === t.id && styles.optionActive]}
          onPress={() => onPick(t)}
        >
          <Text style={styles.optionTitle}>{t.languageName}</Text>
        </Pressable>
      ))}
      {activeId !== null ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.optionMeta}>Subtitle delay: {offset.toFixed(1)}s</Text>
          <Slider
            style={{ height: 32, marginTop: spacing.xs }}
            minimumValue={-5}
            maximumValue={5}
            step={0.5}
            value={offset}
            minimumTrackTintColor={palette.accent}
            maximumTrackTintColor="rgba(244,242,237,0.25)"
            thumbTintColor={palette.accent}
            onValueChange={onOffset}
          />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? (
            <Pressable style={styles.option} onPress={onRetry}>
              <Text style={styles.optionTitle}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!loading && tracks !== null && tracks.length === 0 && !error ? (
        <Text style={styles.optionMeta}>No caption tracks were returned for this title.</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderColor: palette.glassStroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.sm,
    maxHeight: "75%",
  },
  sheetScroll: { flexGrow: 0 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: palette.glassStroke, marginBottom: spacing.xs },
  sheetTitle: { ...typeScale.title, color: palette.textPrimary, marginBottom: spacing.sm },
  option: {
    borderRadius: radius.md,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionActive: { borderColor: palette.accent, backgroundColor: "rgba(240,120,85,0.10)" },
  optionTitle: { color: palette.textPrimary, fontWeight: "700", fontSize: 15 },
  optionMeta: { color: palette.textMuted, fontSize: 12 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  errorText: { color: palette.danger, fontSize: 12, lineHeight: 17 },
});
