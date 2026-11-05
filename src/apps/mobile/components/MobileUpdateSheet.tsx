import { ShieldCheck } from "lucide-react-native";
import React, { memo, useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/design-system/tokens";
import {
  downloadAndInstallUpdate,
  type ReleaseManifest,
} from "@/services/updater/appUpdater";
import { formatBytes } from "@/utils/format";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassProgressBar } from "@/ui/glass/GlassLandscapeCard";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

interface MobileUpdateSheetProps {
  visible: boolean;
  manifest: ReleaseManifest | null;
  currentVersion: string;
  onClose: () => void;
}

/**
 * 1:1 Floating Frosted Liquid Glass Update Bottom Sheet (`docs/ui-previews/mobile-05-downloads-myspace-updater.png`):
 * - Targets strictly `app.hallyu.mobile` / `mobile-update.json`
 * - Emerald-gold 'SHA-256 Verified' shield badge
 * - Glowing Liquid Glass download bar + cached APK reuse across Unknown Sources prompt
 * - Full-width luminous Coral-Ember 'Install Update' capsule + frosted crystal 'Later' button
 */
export const MobileUpdateSheet = memo(function MobileUpdateSheet({
  visible,
  manifest,
  currentVersion,
  onClose,
}: MobileUpdateSheetProps) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = useCallback(async () => {
    if (!manifest || downloading) return;
    setDownloading(true);
    setError(null);
    setStatusNote("Downloading & verifying SHA-256 signature…");
    const res = await downloadAndInstallUpdate(manifest, (p) => setProgress(p));
    setDownloading(false);
    if (res.success) {
      setStatusNote("Verified APK ready · Opening Android installer…");
      return;
    }
    if (res.needsPermission) {
      setStatusNote("Verified APK cached on device. Allow Hallyu in Android Settings, then tap Install Update again.");
      return;
    }
    setError(res.error ?? "Failed to install update.");
    setStatusNote(null);
  }, [downloading, manifest]);

  if (!visible || !manifest) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!downloading) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!downloading) onClose();
          }}
        />

        <View style={[styles.sheetAnchor, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <LiquidGlassView
            variant="dock"
            borderRadius={32}
            blurIntensity={50}
            contentStyle={styles.sheetContent}
          >
            <View style={styles.dragHandle} />

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  Hallyu Mobile{"\n"}Update · v{manifest.version}
                </Text>
                <Text style={styles.packageText}>
                  {manifest.packageName} · v{currentVersion} → v{manifest.version} ({formatBytes(manifest.fileSize)})
                </Text>
              </View>

              <LiquidGlassView variant="emerald" borderRadius={18} contentStyle={styles.shieldBadge}>
                <ShieldCheck size={16} color={palette.gold} />
                <Text style={styles.shieldText}>SHA-256{"\n"}Verified</Text>
              </LiquidGlassView>
            </View>

            <View style={styles.notesBlock}>
              <Text style={styles.sectionLabel}>Release Notes</Text>
              <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.notesBody}>
                  {manifest.releaseNotes.trim() ||
                    "• Faster streaming & 60fps Liquid Glass UI\n• Verified SHA-256 package integrity\n• Subtitle & offline download enhancements"}
                </Text>
              </ScrollView>
            </View>

            {(downloading || progress > 0) && (
              <View style={styles.progressWrap}>
                <Text style={styles.sectionLabel}>Update Package Transfer</Text>
                <GlassProgressBar progress={progress} height={7} />
                <Text style={styles.progressCaption}>
                  {Math.round(progress * 100)}% · {progress >= 1 ? "Verified APK Ready" : "Downloading release package"}
                </Text>
              </View>
            )}

            {statusNote ? <Text style={styles.statusNote}>{statusNote}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.buttonsStack}>
              <GlassPillButton
                label={downloading ? `Downloading ${Math.round(progress * 100)}%…` : "Install Update"}
                variant="primary"
                size="lg"
                fullWidth
                disabled={downloading}
                onPress={handleInstall}
              />
              <GlassPillButton
                label="Later"
                variant="secondary"
                size="lg"
                fullWidth
                disabled={downloading}
                onPress={onClose}
              />
            </View>
          </LiquidGlassView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 5, 10, 0.58)",
    justifyContent: "flex-end",
  },
  sheetAnchor: {
    paddingHorizontal: 14,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 22,
    gap: 16,
  },
  dragHandle: {
    alignSelf: "center",
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.34)",
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  packageText: {
    color: palette.textSecondary,
    fontSize: 12.5,
    marginTop: 5,
  },
  shieldBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 3,
  },
  shieldText: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 14,
  },
  notesBlock: {
    gap: 6,
  },
  sectionLabel: {
    color: palette.textPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  notesScroll: {
    maxHeight: 110,
  },
  notesBody: {
    color: palette.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
  },
  progressWrap: {
    gap: 7,
  },
  progressCaption: {
    color: palette.pearlSoft,
    fontSize: 12.5,
    fontWeight: "600",
  },
  statusNote: {
    color: palette.pearlSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  buttonsStack: {
    gap: 10,
    marginTop: 4,
  },
});
