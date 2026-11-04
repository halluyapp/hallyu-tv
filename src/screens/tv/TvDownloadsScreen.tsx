import { TvButton } from "@/components/tv/TvTile";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing, tvSafeArea, tvTypeScale } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { downloadManager } from "@/services/downloads/manager";
import { absolutePathFor, LegacyFileSystem } from "@/services/downloads/fs";
import { localFileUri } from "@/services/downloads/paths";
import { DownloadJob } from "@/services/downloads/types";
import { formatBytes } from "@/utils/format";
import { useLibrary } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowDownToLine, Play, Trash2, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATE_LABEL: Record<string, string> = {
  queued: "Queued",
  resolving: "Resolving",
  connecting: "Connecting",
  downloading: "Downloading",
  paused: "Paused",
  waiting_for_network: "Waiting for network",
  verifying: "Finishing",
  completed: "Ready offline",
  failed: "Failed",
  cancelled: "Cancelled",
};

const ACTIVE = new Set(["queued", "resolving", "connecting", "downloading", "verifying", "waiting_for_network", "paused"]);

/**
 * TV Downloads — built for a remote, not a fingertip.
 *
 * Differences from the phone screen that matter on a television:
 *  - `Alert.alert` (the mobile confirmation) does not render on TV, so deletion
 *    uses an in-app confirm row that is fully focusable.
 *  - Rows are grouped into Active / Ready / Failed so a large library does not
 *    require scrolling past finished work to reach a transfer.
 *  - Every action is a ≥60 px target with a visible focus ring.
 */
export function TvDownloadsScreen() {
  const navigation = useNavigation<Nav>();
  const { resumeFor } = useLibrary();
  const { play } = useSound();

  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  /** Job id awaiting delete confirmation. Replaces Alert.alert on TV. */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    void LegacyFileSystem.freeDiskBytes().then(setFreeBytes);
    void downloadManager.hydrate();
    return downloadManager.subscribe(setJobs);
  }, []);

  const active = useMemo(() => jobs.filter((j) => ACTIVE.has(j.state)), [jobs]);
  const ready = useMemo(() => jobs.filter((j) => j.state === "completed"), [jobs]);
  const failed = useMemo(() => jobs.filter((j) => j.state === "failed" || j.state === "cancelled"), [jobs]);
  const usedBytes = useMemo(
    () => jobs.reduce((sum, j) => sum + (j.state === "completed" ? (j.totalBytes ?? 0) : j.receivedBytes), 0),
    [jobs],
  );

  const playOffline = useCallback(
    (job: DownloadJob) => {
      const p = resumeFor(job.subjectId, job.season || null, job.episode || null);
      const uri = job.engine === "native" ? localFileUri(job.finalPath) : absolutePathFor(job.finalPath);
      play("play");
      navigation.navigate("Player", {
        subjectId: job.subjectId,
        detailPath: job.detailPath,
        title: job.title,
        posterUrl: job.posterUrl,
        mediaType: job.mediaType,
        season: job.season,
        episode: job.episode,
        resumeAt: p && !p.completed ? Math.floor(p.position_seconds) : 0,
        sources: [
          {
            url: uri,
            resolution: "Offline",
            qualityValue: null,
            format: "MP4",
            codec: job.source.codec,
            sizeBytes: job.totalBytes,
            durationSeconds: null,
            sourceLabel: "Offline",
            preview: false,
            verifiedFullLength: true,
          },
        ],
      });
    },
    [navigation, resumeFor, play],
  );

  const doDelete = useCallback(
    (id: string) => {
      setConfirmId(null);
      play("tap");
      void downloadManager.delete(id);
    },
    [play],
  );

  const renderJob = (job: DownloadJob, index: number) => {
    const pct = job.totalBytes && job.totalBytes > 0 ? Math.min(100, (job.receivedBytes / job.totalBytes) * 100) : null;
    const confirming = confirmId === job.id;
    const firstFocus = index === 0 && confirmId === null;

    return (
      <View key={job.id} style={styles.jobRow}>
        <Poster uri={job.posterUrl} style={styles.poster} initials={initialsFor(job.title)} borderRadius={radius.md} />
        <View style={styles.jobBody}>
          <Text numberOfLines={1} style={styles.jobTitle}>
            {job.title}
          </Text>
          <Text style={styles.jobMeta}>
            {[
              STATE_LABEL[job.state] ?? job.state,
              job.mediaType === "series" && job.season ? `S${job.season} E${job.episode}` : "Movie",
              job.source.resolution,
              job.totalBytes ? `${formatBytes(job.receivedBytes)} / ${formatBytes(job.totalBytes)}` : formatBytes(job.receivedBytes),
            ]
              .filter(Boolean)
              .join("   ·   ")}
          </Text>

          {ACTIVE.has(job.state) ? (
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: pct !== null ? `${pct}%` : "12%", opacity: pct !== null ? 1 : 0.5 }]} />
            </View>
          ) : null}

          {(job.state === "failed" || job.state === "waiting_for_network") && job.failureReason ? (
            <Text style={styles.failReason}>{job.failureReason}</Text>
          ) : null}

          {confirming ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>Delete this offline file?</Text>
              <TvButton label="Delete" variant="danger" hasPreferredFocus onPress={() => doDelete(job.id)} />
              <TvButton label="Keep" onPress={() => setConfirmId(null)} />
            </View>
          ) : (
            <View style={styles.actions}>
              {job.state === "completed" ? (
                <TvButton
                  label="Play offline"
                  icon={<Play size={18} color={palette.textOnAccent} fill={palette.textOnAccent} />}
                  variant="primary"
                  hasPreferredFocus={firstFocus}
                  onPress={() => playOffline(job)}
                />
              ) : null}
              {job.state === "failed" || job.state === "cancelled" || job.state === "paused" ? (
                <TvButton
                  label={job.state === "paused" ? "Resume" : "Retry"}
                  icon={<ArrowDownToLine size={18} color={palette.textPrimary} />}
                  hasPreferredFocus={firstFocus}
                  onPress={() => void downloadManager.resume(job.id)}
                />
              ) : null}
              {ACTIVE.has(job.state) && job.state !== "paused" ? (
                <TvButton
                  label="Cancel"
                  icon={<XCircle size={18} color={palette.warning} />}
                  hasPreferredFocus={firstFocus}
                  onPress={() => void downloadManager.cancel(job.id)}
                />
              ) : null}
              <TvButton
                label="Delete"
                icon={<Trash2 size={18} color={palette.danger} />}
                variant="danger"
                onPress={() => setConfirmId(job.id)}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  const sections: { key: string; label: string; items: DownloadJob[] }[] = [
    { key: "active", label: `Downloading (${active.length})`, items: active },
    { key: "ready", label: `Ready offline (${ready.length})`, items: ready },
    { key: "failed", label: `Needs attention (${failed.length})`, items: failed },
  ].filter((s) => s.items.length > 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Downloads</Text>
          <Text style={styles.subtitle}>
            {jobs.length > 0
              ? `${formatBytes(usedBytes)} used${freeBytes !== null ? `   ·   ${formatBytes(freeBytes)} free` : ""}   ·   stored only on this device`
              : "Files live in this app's private storage and play without a network."}
          </Text>
        </View>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyBody}>Open any title and choose Download to keep it on this device.</Text>
          <View style={{ marginTop: spacing.lg }}>
            <TvButton label="Back to home" hasPreferredFocus onPress={() => navigation.navigate("TvHome")} />
          </View>
        </View>
      ) : (
        sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            {section.items.map((job, i) => renderJob(job, i))}
          </View>
        ))
      )}

      {jobs.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <TvButton label="Back to home" onPress={() => navigation.navigate("TvHome")} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  content: { padding: tvSafeArea.horizontal, paddingBottom: spacing.huge },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xl },
  title: { ...tvTypeScale.display, color: palette.textPrimary },
  subtitle: { ...tvTypeScale.caption, color: palette.textMuted, marginTop: 4 },
  section: { marginBottom: spacing.xxl },
  sectionLabel: { ...tvTypeScale.headline, color: palette.textSecondary, marginBottom: spacing.md },
  jobRow: {
    flexDirection: "row",
    gap: spacing.xl,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  poster: { width: 96, height: 144 },
  jobBody: { flex: 1, gap: spacing.xs },
  jobTitle: { ...tvTypeScale.title, color: palette.textPrimary },
  jobMeta: { ...tvTypeScale.caption, color: palette.textMuted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceRaised, overflow: "hidden", marginTop: spacing.xs, maxWidth: 620 },
  bar: { height: 8, borderRadius: 4, backgroundColor: palette.cyan },
  failReason: { ...tvTypeScale.caption, color: palette.danger },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  confirmRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  confirmText: { ...tvTypeScale.body, color: palette.textPrimary },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.huge, gap: spacing.sm },
  emptyTitle: { ...tvTypeScale.title, color: palette.textPrimary },
  emptyBody: { ...tvTypeScale.body, color: palette.textSecondary, textAlign: "center", maxWidth: 600 },
});
