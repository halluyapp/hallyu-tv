import * as Device from "expo-device";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import { APP_NAME, APP_VERSION, PACKAGE_NAME } from "@/config/branding";
import { palette } from "@/design-system/tokens";
import { deviceLabel } from "@/services/device/tvDetection";
import { useSound } from "@/services/sound/SoundContext";
import { clearCachedSubtitles } from "@/services/subtitles/cache";
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
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

const LEFT_INSET = COLLAPSED_RAIL_WIDTH + 44;

const QUALITY_CYCLE: QualityPreference[] = ["auto", "1080p", "720p", "480p", "360p"];
const LANG_CYCLE: SubtitleLanguagePref[] = ["en", "ko", "zh", "ja", "es", "fr", "ar", "id", "off"];
const SCALE_CYCLE: { value: number; label: string }[] = [
  { value: 0.85, label: "Small" },
  { value: 1, label: "Normal" },
  { value: 1.2, label: "Large" },
  { value: 1.4, label: "Cinema XL" },
];

interface TvSettingsScreenProps {
  onOpenUpdateModal: (manifest: ReleaseManifest, currentVersion: string) => void;
}

/**
 * 10-foot Liquid Glass TV Settings Screen + Variant-Strict TV Updater trigger.
 */
export function TvSettingsScreen({ onOpenUpdateModal }: TvSettingsScreenProps) {
  const { prefs, updatePrefs } = usePreferences();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled } = useSound();
  const { progress, clearHistory } = useLibrary();

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);

  const hwLabel = deviceLabel({
    platform: Platform.OS,
    isTV: Platform.isTV,
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    model: Device.modelName,
  });
  const versionCode = getCurrentAppVersionCode();

  const cycleQuality = useCallback(() => {
    const idx = QUALITY_CYCLE.indexOf(prefs.preferredQuality);
    const next = QUALITY_CYCLE[(idx + 1) % QUALITY_CYCLE.length]!;
    void updatePrefs({ preferredQuality: next });
  }, [prefs.preferredQuality, updatePrefs]);

  const cycleSubtitleLang = useCallback(() => {
    const idx = LANG_CYCLE.indexOf(prefs.preferredSubtitleLang);
    const next = LANG_CYCLE[(idx + 1) % LANG_CYCLE.length]!;
    void updatePrefs({ preferredSubtitleLang: next });
  }, [prefs.preferredSubtitleLang, updatePrefs]);

  const cycleSubtitleScale = useCallback(() => {
    const idx = SCALE_CYCLE.findIndex((s) => Math.abs(s.value - prefs.subtitleScale) < 0.05);
    const next = SCALE_CYCLE[(idx + 1) % SCALE_CYCLE.length]!;
    void updatePrefs({ subtitleScale: next.value });
  }, [prefs.subtitleScale, updatePrefs]);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus("Checking GitHub Releases for Hallyu TV (tv-update.json)…");
    const res = await checkForAppUpdates("tv");
    setCheckingUpdate(false);
    if (res.hasUpdate && res.manifest) {
      setUpdateStatus(`Update v${res.manifest.version} verified & ready!`);
      onOpenUpdateModal(res.manifest, res.currentVersion);
      return;
    }
    if (res.error) {
      setUpdateStatus(res.error);
      return;
    }
    setUpdateStatus(`You are running the latest Hallyu TV release (v${res.currentVersion}).`);
  }, [checkingUpdate, onOpenUpdateModal]);

  const currentScaleLabel =
    SCALE_CYCLE.find((s) => Math.abs(s.value - prefs.subtitleScale) < 0.05)?.label ?? "Normal";

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas intensity="subtle" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingLeft: LEFT_INSET }]}
      >
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Playback quality, subtitles, privacy & verified Hallyu TV updates</Text>

        {/* Playback & Subtitles */}
        <LiquidGlassView variant="card" borderRadius={24} style={styles.group} contentStyle={styles.groupInner}>
          <Text style={styles.groupHeading}>Playback & Subtitles</Text>

          <SettingRow
            label="Default Stream Quality"
            description="Auto HD selects full-length 1080p/720p MP4 streams automatically on TV."
            actionLabel={qualityPreferenceLabel(prefs.preferredQuality, true)}
            hasTVPreferredFocus
            onPress={cycleQuality}
          />
          <SettingRow
            label="Preferred Subtitle Language"
            description="Automatically enables matching captions when a stream starts."
            actionLabel={LANGUAGE_LABELS[prefs.preferredSubtitleLang]}
            onPress={cycleSubtitleLang}
          />
          <SettingRow
            label="Subtitle Size"
            description="Adjust 10-foot caption legibility across the room."
            actionLabel={currentScaleLabel}
            onPress={cycleSubtitleScale}
          />
          <SettingRow
            label="Auto-Play Next Episode"
            description="Show an 8-second countdown and advance automatically near episode end."
            actionLabel={prefs.autoPlayNext ? "On" : "Off"}
            onPress={() => void updatePrefs({ autoPlayNext: !prefs.autoPlayNext })}
          />
          <SettingRow
            label="Interface Sound Effects"
            description="Subtle Liquid Glass focus ticks and confirmation chimes."
            actionLabel={soundEnabled ? "On" : "Muted"}
            onPress={() => setSoundEnabled(!soundEnabled)}
          />
        </LiquidGlassView>

        {/* Local Data & Privacy */}
        <LiquidGlassView variant="card" borderRadius={24} style={styles.group} contentStyle={styles.groupInner}>
          <Text style={styles.groupHeading}>Local Library & Cache</Text>

          <SettingRow
            label="Watch History"
            description={`${progress.length} resume points saved privately on this television.`}
            actionLabel="Clear History"
            icon={<Trash2 size={15} color="#FFFFFF" />}
            onPress={() => {
              void clearHistory();
              setCacheMessage("Watch history cleared.");
            }}
          />
          <SettingRow
            label="Offline Subtitle Cache"
            description="Clear cached SRT/WebVTT caption tracks stored in local memory."
            actionLabel="Clear Captions"
            onPress={() => {
              void clearCachedSubtitles();
              setCacheMessage("Cached subtitle tracks cleared.");
            }}
          />
          {cacheMessage ? <Text style={styles.statusNote}>{cacheMessage}</Text> : null}
        </LiquidGlassView>

        {/* App Identity & Verified In-App Updater */}
        <LiquidGlassView variant="dock" borderRadius={26} style={styles.group} contentStyle={styles.groupInner}>
          <View style={styles.identityHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupHeading}>{APP_NAME} · In-App Updater</Text>
              <Text style={styles.metaText}>
                Package: {PACKAGE_NAME} · Version {APP_VERSION} (build {versionCode}) · {hwLabel}
              </Text>
            </View>
            <LiquidGlassView variant="emerald" borderRadius={14} contentStyle={styles.verifiedBadge}>
              <ShieldCheck size={15} color={palette.gold} />
              <Text style={styles.verifiedText}>SHA-256 Verified Channel</Text>
            </LiquidGlassView>
          </View>

          {updateStatus ? <Text style={styles.statusNote}>{updateStatus}</Text> : null}

          <View style={styles.updateActions}>
            <GlassPillButton
              label={checkingUpdate ? "Checking Release Channel…" : "Check for TV Update"}
              icon={<RefreshCw size={15} color={palette.pearlInk} />}
              variant="primary"
              size="tv"
              disabled={checkingUpdate}
              onPress={handleCheckUpdate}
            />
          </View>
        </LiquidGlassView>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  label,
  description,
  actionLabel,
  icon,
  hasTVPreferredFocus,
  onPress,
}: {
  label: string;
  description: string;
  actionLabel: string;
  icon?: React.ReactNode;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{label}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
      <GlassPillButton
        label={actionLabel}
        icon={icon}
        variant="secondary"
        size="md"
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingTop: 26,
    paddingRight: 36,
    paddingBottom: 60,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },
  group: {
    marginBottom: 20,
  },
  groupInner: {
    padding: 22,
    gap: 16,
  },
  groupHeading: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 4,
  },
  settingTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  settingDesc: {
    color: palette.textMuted,
    fontSize: 12.5,
    marginTop: 2,
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  metaText: {
    color: palette.textSecondary,
    fontSize: 12.5,
    marginTop: 4,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  verifiedText: {
    color: palette.gold,
    fontSize: 11.5,
    fontWeight: "800",
  },
  statusNote: {
    color: palette.pearlSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  updateActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
});
