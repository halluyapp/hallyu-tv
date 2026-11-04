import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { BlurSurface } from "@/components/ui/BlurSurface";
import { TvFocusable } from "@/components/tv/TvFocusable";
import { CaptionTrack, StreamSource } from "@/types/provider";
import type { AudioTrack, SubtitleTrack } from "expo-video";
import React from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

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
  const isTV = Platform.isTV;
  return (
    <Pressable style={styles.sheetBackdrop} onPress={onClose}>
      <Pressable onPress={(e) => e.stopPropagation?.()} style={isTV ? styles.sheetTv : undefined}>
        <BlurSurface material="elevated" radius={radius.sheet} style={isTV ? styles.sheetTvPanel : styles.sheet}>
          <View style={[styles.sheetBody, isTV && styles.sheetBodyTv]}>
            <View style={styles.grabber} />
            <Text style={[styles.sheetTitle, isTV && { fontSize: 30 }]}>{title}</Text>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </BlurSurface>
      </Pressable>
    </Pressable>
  );
}

/** One selectable row. Focusable on TV, tappable on phones. */
function OptionRow({
  label,
  meta,
  active,
  onPress,
  hasPreferredFocus,
}: {
  label: string;
  meta?: string | null;
  active: boolean;
  onPress: () => void;
  hasPreferredFocus?: boolean;
}) {
  return (
    <TvFocusable
      onPress={onPress}
      hasTVPreferredFocus={hasPreferredFocus}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={meta ? `${label}, ${meta}` : label}
      style={[styles.option, active && styles.optionActive]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{label}</Text>
      </View>
      {meta ? <Text style={styles.optionMeta}>{meta}</Text> : null}
    </TvFocusable>
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
      {sources.map((s, index) => (
        <OptionRow
          key={s.url}
          label={s.resolution ?? s.format}
          meta={[s.codec?.toUpperCase(), s.sizeBytes ? `${(s.sizeBytes / 1_048_576).toFixed(0)} MB` : null, s.format]
            .filter(Boolean)
            .join(" · ")}
          active={s.url === activeUri}
          hasPreferredFocus={index === 0}
          onPress={() => onPick(s)}
        />
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
      <OptionRow label="Off" active={activeId === null} hasPreferredFocus onPress={onOff} />
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={styles.optionMeta}>Loading subtitle tracks…</Text>
        </View>
      ) : null}
      {(tracks ?? []).map((t) => (
        <OptionRow key={t.id} label={t.languageName} active={activeId === t.id} onPress={() => onPick(t)} />
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
            maximumTrackTintColor={palette.surfaceRaised}
            thumbTintColor={palette.cyan}
            onValueChange={onOffset}
          />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? <OptionRow label="Retry" active={false} onPress={onRetry} /> : null}
        </View>
      ) : null}
      {!loading && tracks !== null && tracks.length === 0 && !error ? (
        <Text style={styles.optionMeta}>No caption tracks were returned for this title.</Text>
      ) : null}
    </>
  );
}

/** Playback speed choices shown in the speed sheet. */
export function SpeedOptions({
  activeRate,
  onPick,
}: {
  activeRate: number;
  onPick: (rate: number) => void;
}) {
  return (
    <>
      {PLAYBACK_RATES.map((rate, index) => (
        <OptionRow
          key={rate}
          label={rate === 1 ? "Normal" : `${rate}×`}
          meta={rate === 1 ? "Default" : null}
          active={rate === activeRate}
          hasPreferredFocus={index === 0}
          onPress={() => onPick(rate)}
        />
      ))}
    </>
  );
}

/**
 * Audio + subtitle tracks embedded in the stream itself (expo-video native
 * selection). Hidden when the current source has none.
 */
export function NativeTracksOptions({
  audioTracks,
  subtitleTracks,
  activeAudioId,
  activeSubtitleId,
  onPickAudio,
  onPickSubtitle,
}: {
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  activeAudioId: string | null;
  activeSubtitleId: string | null;
  onPickAudio: (t: AudioTrack | null) => void;
  onPickSubtitle: (t: SubtitleTrack | null) => void;
}) {
  if (audioTracks.length === 0 && subtitleTracks.length === 0) return null;
  return (
    <>
      {audioTracks.length > 1 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.groupLabel}>Audio</Text>
          {audioTracks.map((t) => (
            <OptionRow
              key={t.id}
              label={t.label || t.language || "Audio"}
              active={t.id === activeAudioId}
              onPress={() => onPickAudio(t)}
            />
          ))}
        </View>
      ) : null}
      {subtitleTracks.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.groupLabel}>Embedded subtitles</Text>
          <OptionRow label="Off" active={activeSubtitleId === null} onPress={() => onPickSubtitle(null)} />
          {subtitleTracks.map((t) => (
            <OptionRow
              key={t.id}
              label={t.label || t.language || "Subtitles"}
              active={t.id === activeSubtitleId}
              onPress={() => onPickSubtitle(t)}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  groupLabel: { ...typeScale.micro, color: palette.textSecondary, marginTop: spacing.sm },
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
  optionActive: { borderColor: palette.cyan, backgroundColor: palette.accentSoft },
  sheetBody: { padding: spacing.xl, gap: spacing.sm },
  sheetBodyTv: { padding: spacing.xxl, gap: spacing.md, minWidth: 640 },
  sheetTv: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.huge },
  sheetTvPanel: { maxHeight: "82%" },
  optionTitle: { color: palette.textPrimary, fontWeight: "700", fontSize: 15 },
  optionMeta: { color: palette.textMuted, fontSize: 12 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  errorText: { color: palette.danger, fontSize: 12, lineHeight: 17 },
});
