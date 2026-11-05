import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { type CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Play, RefreshCw, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_TAB_BAR_CLEARANCE } from "@/apps/mobile/components/MobileTabBar";
import type { MobileStackParamList, MobileTabParamList } from "@/apps/mobile/navigation/mobileTypes";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { APP_NAME, APP_VERSION, PACKAGE_NAME } from "@/config/branding";
import { palette } from "@/design-system/tokens";
import { LegacyFileSystem } from "@/services/downloads/fs";
import { downloadManager } from "@/services/downloads/manager";
import { localFileUri } from "@/services/downloads/paths";
import type { DownloadJob } from "@/services/downloads/types";
import { useSound } from "@/services/sound/SoundContext";
import {
  checkForAppUpdates,
  getCurrentAppVersionCode,
  type ReleaseManifest,
} from "@/services/updater/appUpdater";
import { useLibrary } from "@/state/LibraryContext";
import {
  LANGUAGE_LABELS,
  qualityPreferenceLabel,
  usePreferences,
  type QualityPreference,
  type SubtitleLanguagePref,
} from "@/state/PreferencesContext";
import type { CatalogueItem } from "@/types/provider";
import { formatBytes } from "@/utils/format";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassProgressBar } from "@/ui/glass/GlassLandscapeCard";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type TabNav = CompositeNavigationProp<
  BottomTabNavigationProp<MobileTabParamList>,
  NativeStackNavigationProp<MobileStackParamList>
>;

/**
 * 1:1 Hallyu Mobile Downloads Screen (`docs/ui-previews/mobile-05-downloads-myspace-updater.png`):
 * - Frosted Liquid Glass Device Storage card ('X.X GB Offline · XX.X GB Free' + glowing coral-amber bar)
 * - Grouped Series offline folders + individual episode/movie downloads
 * - One-tap 'Play Offline', 'Retry', and 'Delete'
 */
export function MobileDownloadsScreen() {
  const navigation = useNavigation<TabNav>();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [freeDisk, setFreeDisk] = useState<number | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  useEffect(() => {
    void downloadManager.hydrate();
    const unsub = downloadManager.subscribe(setJobs);
    LegacyFileSystem.freeDiskBytes().then(setFreeDisk).catch(() => {});
    return unsub;
  }, []);

  const offlineBytes = useMemo(
    () =>
      jobs.reduce(
        (sum, j) => sum + (j.state === "completed" ? j.totalBytes ?? j.receivedBytes : j.receivedBytes),
        0,
      ),
    [jobs],
  );

  const storageRatio =
    freeDisk && freeDisk > 0 ? Math.min(1, offlineBytes / (offlineBytes + freeDisk)) : 0.16;

  // Group completed series episodes neatly by subjectId like `mobile-05`
  const groupedSeries = useMemo(() => {
    const map = new Map<string, { subjectId: string; title: string; posterUrl: string | null; jobs: DownloadJob[]; totalBytes: number }>();
    for (const job of jobs) {
      if (job.mediaType === "series") {
        const entry = map.get(job.subjectId) ?? {
          subjectId: job.subjectId,
          title: job.title,
          posterUrl: job.posterUrl,
          jobs: [],
          totalBytes: 0,
        };
        entry.jobs.push(job);
        entry.totalBytes += job.totalBytes ?? job.receivedBytes;
        map.set(job.subjectId, entry);
      }
    }
    return Array.from(map.values());
  }, [jobs]);

  const standaloneMovies = useMemo(
    () => jobs.filter((j) => j.mediaType !== "series"),
    [jobs],
  );

  const playJobOffline = useCallback(
    (job: DownloadJob) => {
      const uri =
        job.engine === "native"
          ? localFileUri(job.finalPath)
          : LegacyFileSystem.absolutePathFor(job.finalPath);
      navigation.navigate("MobilePlayer", {
        subjectId: job.subjectId,
        detailPath: job.detailPath,
        title: job.title,
        posterUrl: job.posterUrl,
        mediaType: job.mediaType,
        season: job.season,
        episode: job.episode,
        resumeAt: 0,
        sources: [{ ...job.source, url: uri }],
        nextEpisode: null,
      });
    },
    [navigation],
  );

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={jobs[0]?.posterUrl} intensity="subtle" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollPad,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + MOBILE_TAB_BAR_CLEARANCE,
          },
        ]}
      >
        <Text style={styles.pageTitle}>Downloads</Text>

        {/* Liquid Glass Device Storage Card */}
        <LiquidGlassView variant="card" borderRadius={22} contentStyle={styles.storageCard}>
          <Text style={styles.storageMicro}>Device Offline Storage</Text>
          <Text style={styles.storageHeadline}>
            <Text style={styles.storageBold}>{formatBytes(offlineBytes)}</Text>
            <Text style={styles.storageSub}>
              {" "}Offline{freeDisk ? ` · ${formatBytes(freeDisk)} Free` : ""}
            </Text>
          </Text>
          <GlassProgressBar progress={storageRatio} height={8} style={{ marginTop: 6 }} />
        </LiquidGlassView>

        {jobs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Offline Downloads Yet</Text>
            <Text style={styles.emptySub}>
              Tap Download on any movie or episode to save verified MP4 video directly to your phone.
            </Text>
          </View>
        ) : (
          <>
            {groupedSeries.length > 0 ? (
              <View style={styles.groupSection}>
                <Text style={styles.sectionHeading}>Series Folders</Text>
                {groupedSeries.map((group) => {
                  const isOpen = expandedSeries === group.subjectId;
                  return (
                    <View key={group.subjectId} style={{ gap: 8 }}>
                      <Pressable onPress={() => setExpandedSeries(isOpen ? null : group.subjectId)}>
                        <LiquidGlassView variant="card" borderRadius={20} contentStyle={styles.folderRow}>
                          <Poster
                            uri={group.posterUrl}
                            initials={initialsFor(group.title)}
                            style={styles.folderThumb}
                          />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={styles.folderTitle}>
                              {group.title}
                            </Text>
                            <Text style={styles.folderSub}>
                              {group.jobs.length} Episode{group.jobs.length > 1 ? "s" : ""} · {formatBytes(group.totalBytes)}
                            </Text>
                          </View>
                          <ChevronRight size={18} color={palette.textMuted} />
                        </LiquidGlassView>
                      </Pressable>

                      {isOpen
                        ? group.jobs
                            .sort((a, b) => a.season - b.season || a.episode - b.episode)
                            .map((job) => (
                              <DownloadJobRow
                                key={job.id}
                                job={job}
                                onPlay={playJobOffline}
                              />
                            ))
                        : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {standaloneMovies.length > 0 ? (
              <View style={styles.groupSection}>
                <Text style={styles.sectionHeading}>Offline Movies</Text>
                {standaloneMovies.map((job) => (
                  <DownloadJobRow key={job.id} job={job} onPlay={playJobOffline} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DownloadJobRow({
  job,
  onPlay,
}: {
  job: DownloadJob;
  onPlay: (job: DownloadJob) => void;
}) {
  const pct = job.totalBytes && job.totalBytes > 0 ? job.receivedBytes / job.totalBytes : 0;
  return (
    <LiquidGlassView variant="card" borderRadius={18} contentStyle={styles.jobRow}>
      <Poster uri={job.posterUrl} initials={initialsFor(job.title)} style={styles.jobThumb} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={styles.jobTitle}>
          {job.mediaType === "series" ? `S${job.season} · E${job.episode} — ${job.title}` : job.title}
        </Text>
        <Text style={styles.jobMeta}>
          {job.source.resolution ?? "MP4"} · {job.state}
          {job.totalBytes ? ` · ${formatBytes(job.totalBytes)}` : ""}
        </Text>
        {job.failureReason ? <Text style={styles.jobError}>{job.failureReason}</Text> : null}
        {job.state !== "completed" ? <GlassProgressBar progress={pct} height={4} style={{ marginTop: 4 }} /> : null}
      </View>

      <View style={styles.jobBtns}>
        {job.state === "completed" ? (
          <Pressable onPress={() => onPlay(job)} style={styles.circleBtnPrimary}>
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
          </Pressable>
        ) : job.state === "failed" || job.state === "paused" || job.state === "waiting_for_network" ? (
          <Pressable onPress={() => downloadManager.resume(job.id)} style={styles.circleBtn}>
            <RotateCcw size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <Pressable onPress={() => void downloadManager.delete(job.id)} style={styles.circleBtn}>
          <Trash2 size={14} color={palette.textSecondary} />
        </Pressable>
      </View>
    </LiquidGlassView>
  );
}

const QUALITY_ORDER: QualityPreference[] = ["auto", "360p", "480p", "720p", "1080p"];
const LANG_ORDER: SubtitleLanguagePref[] = ["en", "ko", "zh", "ja", "es", "fr", "ar", "id", "off"];

/**
 * 1:1 Hallyu Mobile My Space & Updater Screen (`docs/ui-previews/mobile-05-downloads-myspace-updater.png`):
 * - Device Storage card + My List Watchlist + Watch History (with individual remove & Clear All)
 * - Data-conscious Mobile Preferences + Verified Hallyu Mobile In-App Updater card
 */
export function MobileMySpaceScreen({
  onOpenUpdateSheet,
}: {
  onOpenUpdateSheet: (manifest: ReleaseManifest, currentVersion: string) => void;
}) {
  const navigation = useNavigation<TabNav>();
  const insets = useSafeAreaInsets();
  const { watchlist, progress, removeProgress, clearHistory } = useLibrary();
  const { prefs, updatePrefs } = usePreferences();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, hapticsEnabled, setHapticsEnabled } = useSound();

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [freeDisk, setFreeDisk] = useState<number | null>(null);
  const [offlineBytes, setOfflineBytes] = useState(0);

  useEffect(() => {
    LegacyFileSystem.freeDiskBytes().then(setFreeDisk).catch(() => {});
    const unsub = downloadManager.subscribe((jobs) => {
      const total = jobs.reduce((s, j) => s + (j.totalBytes ?? j.receivedBytes), 0);
      setOfflineBytes(total);
    });
    return unsub;
  }, []);

  const mappedWatchlist: CatalogueItem[] = useMemo(
    () =>
      watchlist.map((w) => ({
        name: w.title,
        posterUrl: w.poster_url,
        slug: w.detail_path ?? "",
        subjectId: w.subject_id,
        badge: null,
        rating: null,
        year: null,
        genre: null,
        mediaType: w.media_type,
      })),
    [watchlist],
  );

  const cycleQuality = useCallback(() => {
    const idx = QUALITY_ORDER.indexOf(prefs.preferredQuality);
    const next = QUALITY_ORDER[(idx + 1) % QUALITY_ORDER.length]!;
    void updatePrefs({ preferredQuality: next });
  }, [prefs.preferredQuality, updatePrefs]);

  const cycleLang = useCallback(() => {
    const idx = LANG_ORDER.indexOf(prefs.preferredSubtitleLang);
    const next = LANG_ORDER[(idx + 1) % LANG_ORDER.length]!;
    void updatePrefs({ preferredSubtitleLang: next });
  }, [prefs.preferredSubtitleLang, updatePrefs]);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateMsg("Checking GitHub Releases for Hallyu Mobile (mobile-update.json)…");
    const res = await checkForAppUpdates("mobile");
    setCheckingUpdate(false);
    if (res.hasUpdate && res.manifest) {
      setUpdateMsg(`v${res.manifest.version} verified & ready to install!`);
      onOpenUpdateSheet(res.manifest, res.currentVersion);
      return;
    }
    if (res.error) {
      setUpdateMsg(res.error);
      return;
    }
    setUpdateMsg(`You are on the latest Hallyu Mobile release (v${res.currentVersion}).`);
  }, [checkingUpdate, onOpenUpdateSheet]);

  const storageRatio =
    freeDisk && freeDisk > 0 ? Math.min(1, offlineBytes / (offlineBytes + freeDisk)) : 0.14;

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={watchlist[0]?.poster_url ?? progress[0]?.poster_url} intensity="subtle" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollPad,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + MOBILE_TAB_BAR_CLEARANCE,
          },
        ]}
      >
        <Text style={styles.pageTitle}>My Space</Text>

        {/* Liquid Glass Device Storage Summary */}
        <LiquidGlassView variant="card" borderRadius={22} contentStyle={styles.storageCard}>
          <Text style={styles.storageMicro}>Device Storage</Text>
          <Text style={styles.storageHeadline}>
            <Text style={styles.storageBold}>{formatBytes(offlineBytes)}</Text>
            <Text style={styles.storageSub}>
              {" "}Offline{freeDisk ? ` · ${formatBytes(freeDisk)} Free` : ""}
            </Text>
          </Text>
          <GlassProgressBar progress={storageRatio} height={8} style={{ marginTop: 6 }} />
        </LiquidGlassView>

        {/* My List Watchlist */}
        <View style={styles.groupSection}>
          <Text style={styles.sectionHeading}>My List ({watchlist.length})</Text>
          {mappedWatchlist.length === 0 ? (
            <Text style={styles.mutedHint}>Titles you save with + My List stay privately on this phone.</Text>
          ) : (
            <FlatList
              horizontal
              data={mappedWatchlist}
              keyExtractor={(i) => i.subjectId}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
              renderItem={({ item }) => (
                <GlassPosterCard
                  item={item}
                  width={106}
                  onPress={(picked) => {
                    if (!picked.slug) return;
                    navigation.navigate("MobileDetails", {
                      subjectId: picked.subjectId,
                      detailPath: picked.slug,
                      title: picked.name,
                      posterUrl: picked.posterUrl,
                    });
                  }}
                />
              )}
            />
          )}
        </View>

        {/* Watch History with Per-Item Delete & Clear All */}
        {progress.length > 0 ? (
          <View style={styles.groupSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionHeading}>Watch History</Text>
              <Pressable onPress={() => void clearHistory()}>
                <Text style={styles.clearAction}>Clear All</Text>
              </Pressable>
            </View>
            {progress.slice(0, 6).map((row) => (
              <LiquidGlassView
                key={`${row.subject_id}-${row.season_number ?? 0}-${row.episode_number ?? 0}`}
                variant="card"
                borderRadius={16}
                contentStyle={styles.historyRow}
              >
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    if (!row.detail_path) return;
                    navigation.navigate("MobileDetails", {
                      subjectId: row.subject_id,
                      detailPath: row.detail_path,
                      title: row.title,
                      posterUrl: row.poster_url,
                    });
                  }}
                >
                  <Text numberOfLines={1} style={styles.historyTitle}>
                    {row.title}
                  </Text>
                  <Text style={styles.historySub}>
                    {row.media_type === "series"
                      ? `Season ${row.season_number ?? 1} · Episode ${row.episode_number ?? 1}`
                      : "Movie"}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => void removeProgress(row.subject_id, row.season_number, row.episode_number)}
                >
                  <X size={16} color={palette.textMuted} />
                </Pressable>
              </LiquidGlassView>
            ))}
          </View>
        ) : null}

        {/* Playback & Interface Preferences */}
        <LiquidGlassView variant="card" borderRadius={22} contentStyle={styles.prefsCard}>
          <Text style={styles.sectionHeading}>Preferences</Text>

          <PrefItem
            label="Default Stream Quality"
            value={qualityPreferenceLabel(prefs.preferredQuality, false)}
            onPress={cycleQuality}
          />
          <PrefItem
            label="Default Subtitles"
            value={LANGUAGE_LABELS[prefs.preferredSubtitleLang]}
            onPress={cycleLang}
          />
          <PrefItem
            label="Auto-Play Next Episode"
            value={prefs.autoPlayNext ? "On" : "Off"}
            onPress={() => void updatePrefs({ autoPlayNext: !prefs.autoPlayNext })}
          />
          <PrefItem
            label="Interface Sounds"
            value={soundEnabled ? "On" : "Muted"}
            onPress={() => setSoundEnabled(!soundEnabled)}
          />
          <PrefItem
            label="Haptic Feedback"
            value={hapticsEnabled ? "On" : "Off"}
            onPress={() => setHapticsEnabled(!hapticsEnabled)}
          />
        </LiquidGlassView>

        {/* App Identity & Variant-Strict Mobile Updater */}
        <LiquidGlassView variant="dock" borderRadius={24} contentStyle={styles.updaterCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionHeading}>{APP_NAME}</Text>
              <Text style={styles.pkgSub}>
                {PACKAGE_NAME} · v{APP_VERSION} (build {getCurrentAppVersionCode()})
              </Text>
            </View>
            <LiquidGlassView variant="emerald" borderRadius={12} contentStyle={styles.miniShield}>
              <ShieldCheck size={14} color={palette.gold} />
              <Text style={styles.miniShieldText}>Verified</Text>
            </LiquidGlassView>
          </View>

          {updateMsg ? <Text style={styles.updateNote}>{updateMsg}</Text> : null}

          <GlassPillButton
            label={checkingUpdate ? "Checking Release…" : "Check for Mobile Update"}
            icon={<RefreshCw size={15} color="#FFFFFF" />}
            variant="primary"
            size="md"
            fullWidth
            disabled={checkingUpdate}
            onPress={handleCheckUpdate}
          />
        </LiquidGlassView>
      </ScrollView>
    </View>
  );
}

function PrefItem({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <View style={styles.prefValueWrap}>
        <Text style={styles.prefValue}>{value}</Text>
        <ChevronRight size={15} color={palette.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollPad: {
    paddingHorizontal: 18,
    gap: 18,
  },
  pageTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  storageCard: {
    padding: 18,
    gap: 6,
  },
  storageMicro: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  storageHeadline: {
    marginTop: 2,
  },
  storageBold: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },
  storageSub: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: "500",
  },
  emptyBox: {
    paddingVertical: 52,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  emptySub: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
    maxWidth: 320,
  },
  groupSection: {
    gap: 10,
  },
  sectionHeading: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  folderThumb: {
    width: 58,
    height: 58,
    borderRadius: 12,
  },
  folderTitle: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "700",
  },
  folderSub: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 11,
    gap: 11,
  },
  jobThumb: {
    width: 50,
    height: 68,
    borderRadius: 10,
  },
  jobTitle: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  jobMeta: {
    color: palette.textSecondary,
    fontSize: 11.5,
  },
  jobError: {
    color: palette.danger,
    fontSize: 11,
  },
  jobBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleBtnPrimary: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  mutedHint: {
    color: palette.textMuted,
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  clearAction: {
    color: palette.accentBright,
    fontSize: 12.5,
    fontWeight: "700",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  historyTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  historySub: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  prefsCard: {
    padding: 18,
    gap: 14,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  prefLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  prefValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  prefValue: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  updaterCard: {
    padding: 18,
    gap: 14,
  },
  pkgSub: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  miniShield: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  miniShieldText: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "800",
  },
  updateNote: {
    color: palette.pearlSoft,
    fontSize: 12.5,
    fontWeight: "600",
  },
});
