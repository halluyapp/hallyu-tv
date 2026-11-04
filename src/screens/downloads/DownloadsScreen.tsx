import { EmptyState } from "@/components/ui/States";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { downloadManager } from "@/services/downloads/manager";
import { absolutePathFor, LegacyFileSystem } from "@/services/downloads/fs";
import { localFileUri } from "@/services/downloads/paths";
import { prefetchSubtitles } from "@/services/subtitles/prefetch";
import { DownloadJob } from "@/services/downloads/types";
import { useLibrary } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  Circle,
  HardDrive,
  ListChecks,
  Pause,
  Play as PlayIcon,
  Trash2,
  AlertTriangle,
  XCircle,
} from "lucide-react-native";
import { formatBytes } from "@/utils/format";

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

interface SpeedSample {
  bytesPerSec: number;
  etaSeconds: number | null;
}

interface DownloadGroup {
  key: string;
  title: string;
  posterUrl: string | null;
  mediaType: DownloadJob["mediaType"];
  jobs: DownloadJob[];
}

export function DownloadsScreen() {
  const navigation = useNavigation<Nav>();
  const { resumeFor } = useLibrary();
  const { play } = useSound();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [speeds, setSpeeds] = useState<Map<string, SpeedSample>>(new Map());
  const prevStates = useRef(new Map<string, string>());
  const samplesRef = useRef(new Map<string, { t: number; bytes: number }>());

  // Real device capacity — measured from the platform, never invented.
  useEffect(() => {
    void LegacyFileSystem.freeDiskBytes().then(setFreeBytes);
  }, []);

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
        if (job.state === "completed") {
          play("complete");
          // Bring the subtitles along so the offline copy is complete too.
          void prefetchSubtitles(job.subjectId, job.detailPath, job.season ?? null, job.episode ?? null);
        } else if (job.state === "failed") play("error");
      }
      prevStates.current.set(job.id, job.state);
    }
  }, [jobs, play]);

  // Transfer rate + ETA from byte deltas between snapshots (~1s poll cadence).
  useEffect(() => {
    const now = Date.now();
    const next = new Map<string, SpeedSample>();
    for (const job of jobs) {
      if (job.state !== "downloading") {
        samplesRef.current.delete(job.id);
        continue;
      }
      const prev = samplesRef.current.get(job.id);
      if (prev && now - prev.t >= 2000 && job.receivedBytes >= prev.bytes) {
        const dt = (now - prev.t) / 1000;
        const bytesPerSec = (job.receivedBytes - prev.bytes) / dt;
        const remaining = job.totalBytes && job.totalBytes > job.receivedBytes ? job.totalBytes - job.receivedBytes : null;
        next.set(job.id, {
          bytesPerSec,
          etaSeconds: bytesPerSec > 1024 && remaining !== null ? remaining / bytesPerSec : null,
        });
      }
      samplesRef.current.set(job.id, { t: now, bytes: job.receivedBytes });
    }
    setSpeeds(next);
  }, [jobs]);

  const usedBytes = jobs.reduce((sum, j) => sum + (j.state === "completed" ? j.totalBytes ?? 0 : j.receivedBytes), 0);

  const activeSelected = useMemo(
    () => Array.from(selected).filter((id) => {
      const j = jobs.find((x) => x.id === id);
      return j && j.state !== "completed" && j.state !== "failed" && j.state !== "cancelled";
    }),
    [selected, jobs],
  );
  const removableSelected = useMemo(
    () => Array.from(selected).filter((id) => jobs.some((j) => j.id === id && j.state === "completed")),
    [selected, jobs],
  );

  // A series is one folder, not one row per episode; movies stay single rows.
  const groups = useMemo(() => {
    const map = new Map<string, DownloadGroup>();
    for (const job of jobs) {
      const key = job.mediaType === "series" ? `series:${job.subjectId}` : `job:${job.id}`;
      const existing = map.get(key);
      if (existing) existing.jobs.push(job);
      else map.set(key, { key, title: job.title, posterUrl: job.posterUrl, mediaType: job.mediaType, jobs: [job] });
    }
    for (const group of map.values()) {
      group.jobs.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    }
    return Array.from(map.values());
  }, [jobs]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmDelete = (job: DownloadJob) =>
    Alert.alert("Delete download?", `“${job.title}” will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void downloadManager.delete(job.id) },
    ]);

  const confirmDeleteSelected = () => {
    const count = removableSelected.length;
    if (count === 0) return;
    Alert.alert("Delete downloads?", `${count} offline file${count === 1 ? "" : "s"} will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          for (const id of removableSelected) void downloadManager.delete(id);
          exitSelectMode();
        },
      },
    ]);
  };

  const toggleGroupSelected = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const confirmDeleteGroup = (group: DownloadGroup) =>
    Alert.alert(
      "Delete the whole folder?",
      `All ${group.jobs.length} downloaded episodes of “${group.title}” will be removed from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            for (const job of group.jobs) void downloadManager.delete(job.id);
          },
        },
      ],
    );

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

  const renderJob = (job: DownloadJob, compact = false) => {
    const posterW = Math.round(stage.posterWidth * (compact ? 0.34 : 0.52));
    const posterH = Math.round(posterW * 1.5);
    const pct = job.totalBytes && job.totalBytes > 0 ? Math.min(100, (job.receivedBytes / job.totalBytes) * 100) : null;
    const isActive = job.state === "downloading" || job.state === "connecting" || job.state === "queued" || job.state === "verifying" || job.state === "resolving";
    const speed = job.state === "downloading" ? speeds.get(job.id) : undefined;
    const speedLabel = speed
      ? ` · ${formatBytes(speed.bytesPerSec)}/s${speed.etaSeconds ? ` · ${Math.max(1, Math.round(speed.etaSeconds / 60))} min left` : ""}`
      : "";
    const checked = selected.has(job.id);
    return (
      <Pressable
        key={job.id}
        style={[styles.job, { padding: stage.cardGap, marginHorizontal: stage.gutter }, compact && styles.episodeRow]}
        onPress={() => (selecting ? toggleSelected(job.id) : undefined)}
        accessibilityRole={selecting ? "checkbox" : undefined}
        accessibilityState={selecting ? { checked } : undefined}
      >
        {selecting ? (
          checked ? <CheckCircle2 size={20} color={palette.accent} /> : <Circle size={20} color={palette.textMuted} />
        ) : null}
        {compact ? null : (
          <Poster
            uri={job.posterUrl}
            style={[styles.poster, { width: posterW, height: posterH, borderRadius: stage.focusRing * 3 }]}
            initials={initialsFor(job.title)}
          />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={[styles.jobTitle, { fontSize: stage.cardTitleSize + 2 }]}>{job.title}</Text>
          <Text style={[styles.jobMeta, { fontSize: stage.metaSize }]}>
            {[
              job.mediaType === "series" && job.season ? `S${job.season} · E${job.episode}` : "Movie",
              STATE_LABEL[job.state] ?? job.state,
              job.source.resolution,
              job.totalBytes ? `${(job.receivedBytes / 1_048_576).toFixed(0)} / ${(job.totalBytes / 1_048_576).toFixed(0)} MB` : `${(job.receivedBytes / 1_048_576).toFixed(0)} MB`,
            ].filter(Boolean).join(" · ")}
          </Text>
          {speedLabel ? <Text style={styles.speedLabel}>{speedLabel}</Text> : null}
          {(job.state === "failed" || job.state === "waiting_for_network") && job.failureReason ? (
            <Text style={styles.failReason}>{job.failureReason}</Text>
          ) : null}
          {isActive || job.state === "paused" ? (
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: pct !== null ? `${pct}%` : "12%", opacity: pct !== null ? 1 : 0.5 }]} />
            </View>
          ) : null}
          <View style={styles.jobActions}>
            {job.state === "queued" && !selecting ? (
              <Pressable style={styles.chipAction} onPress={() => downloadManager.moveToFront(job.id)}>
                <ArrowDownToLine size={13} color={palette.accent} />
                <Text style={[styles.chipLabel, { color: palette.accent }]}>Download next</Text>
              </Pressable>
            ) : null}
            {job.state === "completed" && !selecting ? (
              <Pressable style={styles.chipAction} onPress={() => playOffline(job)}>
                <PlayIcon size={13} color={palette.success} />
                <Text style={[styles.chipLabel, { color: palette.success }]}>Play offline</Text>
              </Pressable>
            ) : null}
            {job.state === "downloading" && job.engine !== "native" && !selecting ? (
              <Pressable style={styles.chipAction} onPress={() => downloadManager.pause(job.id)}>
                <Pause size={13} color={palette.warning} />
                <Text style={[styles.chipLabel, { color: palette.warning }]}>Pause</Text>
              </Pressable>
            ) : null}
            {job.state === "paused" || job.state === "failed" || job.state === "cancelled" ? (
              !selecting ? (
                <Pressable style={styles.chipAction} onPress={() => downloadManager.resume(job.id)}>
                  <ArrowDownToLine size={13} color={palette.textPrimary} />
                  <Text style={styles.chipLabel}>{job.state === "paused" ? "Resume" : "Retry"}</Text>
                </Pressable>
              ) : null
            ) : null}
            {!selecting ? (
              <Pressable style={styles.chipAction} onPress={() => confirmDelete(job)}>
                <Trash2 size={13} color={palette.danger} />
                <Text style={[styles.chipLabel, { color: palette.danger }]}>Delete</Text>
              </Pressable>
            ) : null}
            {job.state === "completed" && !selecting ? <CheckCircle2 size={13} color={palette.success} style={{ marginLeft: "auto" }} /> : null}
          </View>
        </View>
      </Pressable>
    );
  };

  /** A show folder: a small poster collage, episode count, and its own progress. */
  const renderFolder = (group: DownloadGroup) => {
    const posterW = Math.round(stage.posterWidth * 0.62);
    const posterH = Math.round(posterW * 1.5);
    const total = group.jobs.reduce((sum, job) => sum + (job.totalBytes ?? job.receivedBytes), 0);
    const received = group.jobs.reduce((sum, job) => sum + job.receivedBytes, 0);
    const ready = group.jobs.filter((job) => job.state === "completed").length;
    const open = expanded.has(group.key);
    const checked = group.jobs.every((job) => selected.has(job.id));
    return (
      <View key={group.key}>
        <Pressable
          style={[styles.job, { padding: stage.cardGap, marginHorizontal: stage.gutter }]}
          onPress={() => {
            if (selecting) {
              toggleGroupSelected(group.jobs.map((job) => job.id));
              return;
            }
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(group.key)) next.delete(group.key);
              else next.add(group.key);
              return next;
            });
          }}
          accessibilityRole="button"
          accessibilityState={selecting ? { checked } : undefined}
          accessibilityLabel={`${group.title}, ${group.jobs.length} episodes`}
        >
          {selecting ? (
            checked ? <CheckCircle2 size={20} color={palette.accent} /> : <Circle size={20} color={palette.textMuted} />
          ) : null}
          <View style={{ width: posterW + 14, height: posterH + 10 }}>
            {group.jobs.slice(0, 3).map((job, index) => (
              <Poster
                key={job.id}
                uri={job.posterUrl}
                style={[
                  styles.collagePoster,
                  {
                    width: posterW,
                    height: posterH,
                    left: index * 7,
                    top: index * 5,
                    zIndex: 3 - index,
                    borderRadius: stage.focusRing * 3,
                  },
                ]}
                initials={initialsFor(group.title)}
              />
            ))}
            <View style={styles.folderBadge}>
              <Text style={styles.folderBadgeText}>{group.jobs.length}</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={1} style={[styles.jobTitle, { fontSize: stage.cardTitleSize + 2 }]}>
              {group.title}
            </Text>
            <Text style={[styles.jobMeta, { fontSize: stage.metaSize }]}>
              {`${group.jobs.length} episode${group.jobs.length === 1 ? "" : "s"} · ${ready} ready · ${formatBytes(total)}`}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${total > 0 ? Math.min(100, (received / total) * 100) : 0}%` }]} />
            </View>
            <View style={styles.jobActions}>
              <View style={styles.chipAction}>
                <Text style={styles.chipLabel}>{open ? "Hide episodes" : "Open folder"}</Text>
              </View>
              {!selecting ? (
                <Pressable style={styles.chipAction} onPress={() => confirmDeleteGroup(group)}>
                  <Trash2 size={13} color={palette.danger} />
                  <Text style={[styles.chipLabel, { color: palette.danger }]}>Delete all</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Pressable>
        {open ? group.jobs.map((job) => renderJob(job, true)) : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + stage.cardGap }]}>
      <View style={[styles.titleRow, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}>
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: stage.controlSize,
              height: stage.controlSize,
              borderRadius: stage.controlSize / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <ChevronLeft size={22} color={palette.textPrimary} />
          </Pressable>
        ) : null}
        <Text style={[styles.title, { fontSize: stage.titleSize, flex: 1 }]}>Downloads</Text>
        {jobs.length > 0 ? (
          <Pressable
            style={styles.selectToggle}
            onPress={() => (selecting ? exitSelectMode() : setSelecting(true))}
            accessibilityRole="button"
          >
            <ListChecks size={15} color={selecting ? palette.accent : palette.textSecondary} />
            <Text style={[styles.selectToggleLabel, selecting && { color: palette.accent }]}>
              {selecting ? "Done" : "Select"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.subtitle, { paddingHorizontal: stage.gutter, fontSize: Math.max(12, stage.metaSize + 1) }]}>
        Files live in this app's private storage on this device and play without a network.
      </Text>

      {selecting ? (
        <View style={[styles.batchBar, { marginHorizontal: stage.gutter }]}>
          <Text style={styles.batchCount}>{selected.size} selected</Text>
          <View style={styles.batchActions}>
            {activeSelected.length > 0 ? (
              <Pressable
                style={styles.batchBtn}
                onPress={() => {
                  for (const id of activeSelected) downloadManager.cancel(id);
                  exitSelectMode();
                }}
              >
                <XCircle size={14} color={palette.warning} />
                <Text style={[styles.batchBtnLabel, { color: palette.warning }]}>Cancel</Text>
              </Pressable>
            ) : null}
            {removableSelected.length > 0 ? (
              <Pressable style={styles.batchBtn} onPress={confirmDeleteSelected}>
                <Trash2 size={14} color={palette.danger} />
                <Text style={[styles.batchBtnLabel, { color: palette.danger }]}>Delete</Text>
              </Pressable>
            ) : null}
            {activeSelected.length > 0 && removableSelected.length === 0 ? (
              <Text style={styles.batchHint}>Cancelling stops the transfer and removes its partial file.</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {jobs.length > 0 ? (
        <View style={[styles.meter, { marginHorizontal: stage.gutter }]}>
          <View style={styles.meterHead}>
            <HardDrive size={15} color={palette.accentBright} />
            <Text style={styles.meterTitle}>Offline vault</Text>
            <Text style={styles.meterValue}>
              {formatBytes(usedBytes)}
              {freeBytes !== null ? ` · ${formatBytes(freeBytes)} free` : ""}
            </Text>
          </View>
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                {
                  width: freeBytes !== null && freeBytes > 0 ? `${Math.min(100, Math.max(1, (usedBytes / (usedBytes + freeBytes)) * 100))}%` : "6%",
                  opacity: usedBytes > 0 ? 1 : 0.35,
                },
              ]}
            />
          </View>
        </View>
      ) : null}
      {jobs.length === 0 ? (
        <EmptyState
          title="No downloads yet"
          message="Open any title and tap the download icon to save it for offline viewing."
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: stage.gutter * 2 }}>
          {groups.map((group) => {
            const first = group.jobs[0];
            if (!first) return null;
            return group.mediaType === "series" && group.jobs.length > 1 ? renderFolder(group) : renderJob(first);
          })}
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
  },
  title: { ...typeScale.title, color: palette.textPrimary },
  selectToggle: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 8 },
  selectToggleLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: "700" },
  subtitle: { ...typeScale.caption, color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 19 },
  batchBar: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: "rgba(240,120,85,0.08)",
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  batchCount: { ...typeScale.micro, color: palette.accent },
  batchActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg, flexWrap: "wrap" },
  batchBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  batchBtnLabel: { fontSize: 13, fontWeight: "700" },
  batchHint: { color: palette.textMuted, fontSize: 11, flex: 1, minWidth: 160 },
  meter: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  meterHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meterTitle: { ...typeScale.headline, color: palette.textPrimary, flex: 1 },
  meterValue: { color: palette.textSecondary, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceRaised, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: palette.accent },
  job: {
    flexDirection: "row",
    alignItems: "center",
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
  speedLabel: { color: palette.textSecondary, fontSize: 11, fontVariant: ["tabular-nums"] },
  failReason: { color: palette.danger, fontSize: 12 },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: palette.surfaceRaised, overflow: "hidden", marginTop: 2 },
  bar: { height: 4, backgroundColor: palette.accent, borderRadius: 2 },
  jobActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs, flexWrap: "wrap", alignItems: "center" },
  chipAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  chipLabel: { fontSize: 12, fontWeight: "700", color: palette.textPrimary },
  storageNote: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md, alignItems: "flex-start" },
  storageNoteText: { color: palette.textMuted, fontSize: 11, flex: 1, lineHeight: 16 },
  collagePoster: { position: "absolute", borderColor: palette.glassStroke, borderWidth: StyleSheet.hairlineWidth },
  folderBadge: {
    position: "absolute",
    right: -4,
    bottom: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  folderBadgeText: { color: "#160B08", fontSize: 11, fontWeight: "800" },
  episodeRow: { marginLeft: spacing.xxl },
});
