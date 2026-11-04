import { EmptyState } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { downloadManager } from "@/services/downloads/manager";
import { absolutePathFor } from "@/services/downloads/fs";
import { localFileUri } from "@/services/downloads/paths";
import { DownloadJob } from "@/services/downloads/types";
import { useLibrary } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, Pause, Play as PlayIcon, Trash2, AlertTriangle, ArrowDownToLine } from "lucide-react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATE_LABEL: Record<string, string> = {
  queued: "Queued",
  resolving: "Resolving…",
  connecting: "Connecting…",
  downloading: "Downloading",
  paused: "Paused",
  waiting_for_network: "Waiting for network",
  verifying: "Finishing…",
  completed: "Ready offline",
  failed: "Failed",
  cancelled: "Cancelled",
};

function offlineUri(job: DownloadJob): string {
  return job.engine === "native" ? localFileUri(job.finalPath) : absolutePathFor(job.finalPath);
}

export function DownloadsScreen() {
  const navigation = useNavigation<Nav>();
  const { resumeFor } = useLibrary();
  const { play } = useSound();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const prevStates = useRef(new Map<string, string>());

  useEffect(() => {
    void downloadManager.hydrate();
    return downloadManager.subscribe(setJobs);
  }, []);

  // Answer state transitions with sound: a bell when a download lands, a soft
  // low tone when one fails. First snapshot after mount stays silent.
  useEffect(() => {
    for (const job of jobs) {
      const prev = prevStates.current.get(job.id);
      if (prev !== undefined && prev !== job.state) {
        if (job.state === "completed") play("complete");
        else if (job.state === "failed") play("error");
      }
      prevStates.current.set(job.id, job.state);
    }
  }, [jobs, play]);

  const confirmDelete = (job: DownloadJob) =>
    Alert.alert("Delete download?", `“${job.title}” will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void downloadManager.delete(job.id) },
    ]);

  const playOffline = (job: DownloadJob) => {
    const p = resumeFor(job.subjectId, job.season || null, job.episode || null);
    navigation.navigate("Player", {
      subjectId: job.subjectId,
      detailPath: job.detailPath,
      title: job.title,
      posterUrl: job.posterUrl,
      mediaType: job.mediaType,
      season: job.season,
      episode: job.episode,
      resumeAt: p && !p.completed ? p.position_seconds : 0,
      sources: [{
        url: offlineUri(job),
        resolution: "Offline",
        qualityValue: null,
        format: "MP4",
        codec: job.source.codec,
        sizeBytes: job.totalBytes,
        durationSeconds: null,
        sourceLabel: "Offline",
        preview: false,
        verifiedFullLength: true,
      }],
    });
  };

  const renderJob = (job: DownloadJob) => {
    const pct = job.totalBytes && job.totalBytes > 0 ? Math.min(100, (job.receivedBytes / job.totalBytes) * 100) : null;
    const isActive = job.state === "downloading" || job.state === "connecting" || job.state === "queued" || job.state === "verifying" || job.state === "resolving";
    return (
      <View key={job.id} style={styles.job}>
        {job.posterUrl ? (
          <Image source={{ uri: job.posterUrl }} style={styles.poster} />
        ) : (
          <View style={[styles.poster, { backgroundColor: palette.surfaceRaised }]} />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobMeta}>
            {[
              STATE_LABEL[job.state] ?? job.state,
              job.mediaType === "series" && job.season ? `S${job.season} E${job.episode}` : "Movie",
              job.source.resolution,
              job.totalBytes ? `${(job.receivedBytes / 1_048_576).toFixed(0)} / ${(job.totalBytes / 1_048_576).toFixed(0)} MB` : `${(job.receivedBytes / 1_048_576).toFixed(0)} MB`,
            ].filter(Boolean).join(" · ")}
          </Text>
          {(job.state === "failed" || job.state === "waiting_for_network") && job.failureReason ? (
            <Text style={styles.failReason}>{job.failureReason}</Text>
          ) : null}
          {isActive || job.state === "paused" ? (
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: pct !== null ? `${pct}%` : "12%", opacity: pct !== null ? 1 : 0.5 }]} />
            </View>
          ) : null}
          <View style={styles.jobActions}>
            {job.state === "completed" ? (
              <Pressable style={styles.chipAction} onPress={() => playOffline(job)}>
                <PlayIcon size={13} color={palette.success} />
                <Text style={[styles.chipLabel, { color: palette.success }]}>Play offline</Text>
              </Pressable>
            ) : null}
            {job.state === "downloading" && job.engine !== "native" ? (
              <Pressable style={styles.chipAction} onPress={() => downloadManager.pause(job.id)}>
                <Pause size={13} color={palette.warning} />
                <Text style={[styles.chipLabel, { color: palette.warning }]}>Pause</Text>
              </Pressable>
            ) : null}
            {job.state === "paused" || job.state === "failed" || job.state === "cancelled" ? (
              <Pressable style={styles.chipAction} onPress={() => downloadManager.resume(job.id)}>
                <ArrowDownToLine size={13} color={palette.textPrimary} />
                <Text style={styles.chipLabel}>{job.state === "paused" ? "Resume" : "Retry"}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.chipAction} onPress={() => confirmDelete(job)}>
              <Trash2 size={13} color={palette.danger} />
              <Text style={[styles.chipLabel, { color: palette.danger }]}>Delete</Text>
            </Pressable>
            {job.state === "completed" ? <CheckCircle2 size={13} color={palette.success} style={{ marginLeft: "auto" }} /> : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Downloads</Text>
      <Text style={styles.subtitle}>
        Files live in this app's private storage on this device and play without a network.
      </Text>
      {jobs.length === 0 ? (
        <EmptyState
          title="No downloads yet"
          message="Open any title and tap the download icon to save it for offline viewing."
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          {jobs.map(renderJob)}
          <View style={styles.storageNote}>
            <AlertTriangle size={13} color={palette.textMuted} />
            <Text style={styles.storageNoteText}>
              Transfer progress reflects real bytes received. Interrupted downloads restart safely; nothing is marked
              complete until the file is verified.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  title: { ...typeScale.title, color: palette.textPrimary, paddingHorizontal: spacing.xl },
  subtitle: { ...typeScale.caption, color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 19 },
  job: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  poster: { width: 64, height: 96, borderRadius: radius.sm },
  jobTitle: { ...typeScale.headline, color: palette.textPrimary },
  jobMeta: { color: palette.textMuted, fontSize: 12 },
  failReason: { color: palette.danger, fontSize: 12 },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: palette.surfaceRaised, overflow: "hidden", marginTop: 2 },
  bar: { height: 4, backgroundColor: palette.accent, borderRadius: 2 },
  jobActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs, flexWrap: "wrap", alignItems: "center" },
  chipAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  chipLabel: { fontSize: 12, fontWeight: "700", color: palette.textPrimary },
  storageNote: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md, alignItems: "flex-start" },
  storageNoteText: { color: palette.textMuted, fontSize: 11, flex: 1, lineHeight: 16 },
});
