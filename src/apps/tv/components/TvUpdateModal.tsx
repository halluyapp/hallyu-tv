import { ShieldCheck } from "lucide-react-native";
import React, { memo, useCallback, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette, spacing } from "@/design-system/tokens";
import {
  downloadAndInstallUpdate,
  type ReleaseManifest,
} from "@/services/updater/appUpdater";
import { formatBytes } from "@/utils/format";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassProgressBar } from "@/ui/glass/GlassLandscapeCard";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

interface TvUpdateModalProps {
  visible: boolean;
  manifest: ReleaseManifest | null;
  currentVersion: string;
  onClose: () => void;
}

/**
 * 10-foot D-pad focus-safe Liquid Glass Update Modal for Hallyu TV (`app.hallyutv.dev`).
 */
export const TvUpdateModal = memo(function TvUpdateModal({
  visible,
  manifest,
  currentVersion,
  onClose,
}: TvUpdateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = useCallback(async () => {
    if (!manifest || downloading) return;
    setDownloading(true);
    setError(null);
    setStatusNote("Downloading verified Hallyu TV release package…");
    const res = await downloadAndInstallUpdate(manifest, (p) => setProgress(p));
    setDownloading(false);
    if (res.success) {
      setStatusNote("SHA-256 verified · Launching Android TV package installer…");
      return;
    }
    if (res.needsPermission) {
      setStatusNote("APK cached & verified. Enable Unknown Sources in Android TV Settings, then press Install Update.");
      return;
    }
    setError(res.error ?? "Could not install update.");
    setStatusNote(null);
  }, [downloading, manifest]);

  if (!visible || !manifest) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!downloading) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <LiquidGlassView
          variant="dock"
          borderRadius={30}
          blurIntensity={48}
          style={styles.modalCard}
          contentStyle={styles.modalContent}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Hallyu TV Update · v{manifest.version}</Text>
              <Text style={styles.subtitle}>
                {manifest.packageName} · Installed v{currentVersion} · {formatBytes(manifest.fileSize)}
              </Text>
            </View>
            <LiquidGlassView variant="emerald" borderRadius={16} contentStyle={styles.shieldPill}>
              <ShieldCheck size={16} color={palette.gold} />
              <Text style={styles.shieldText}>SHA-256 Verified</Text>
            </LiquidGlassView>
          </View>

          <Text style={styles.sectionHeading}>What’s New</Text>
          <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.notesText}>
              {manifest.releaseNotes.trim() || "Performance, playback stability, and Liquid Glass cinema refinements."}
            </Text>
          </ScrollView>

          {(downloading || progress > 0) && (
            <View style={styles.progressSection}>
              <GlassProgressBar progress={progress} height={7} />
              <Text style={styles.progressLabel}>
                {Math.round(progress * 100)}% · {progress >= 1 ? "Verified APK Ready" : "Downloading release APK"}
              </Text>
            </View>
          )}

          {statusNote ? <Text style={styles.statusNote}>{statusNote}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionRow}>
            <GlassPillButton
              label={downloading ? `Downloading ${Math.round(progress * 100)}%…` : "Install Update"}
              variant="primary"
              size="tv"
              hasTVPreferredFocus
              disabled={downloading}
              onPress={handleInstall}
              style={{ flex: 1 }}
            />
            <GlassPillButton
              label="Later"
              variant="secondary"
              size="tv"
              disabled={downloading}
              onPress={onClose}
              style={{ minWidth: 150 }}
            />
          </View>
        </LiquidGlassView>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 5, 10, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 640,
  },
  modalContent: {
    padding: 28,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  shieldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shieldText: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionHeading: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  notesScroll: {
    maxHeight: 150,
  },
  notesText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  progressSection: {
    gap: 7,
  },
  progressLabel: {
    color: palette.pearlSoft,
    fontSize: 12.5,
    fontWeight: "600",
  },
  statusNote: {
    color: palette.pearlSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
});
