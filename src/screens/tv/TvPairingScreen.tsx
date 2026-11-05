import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/services/auth/AuthContext";
import { useSound } from "@/services/sound/SoundContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronLeft, RefreshCw, Tv, CheckCircle2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TvPairingScreen() {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const { play } = useSound();
  const { activePinSession, generateTvPin, pairedDevices } = useAuth();
  const [focused, setFocused] = useState<"back" | "refresh" | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    void generateTvPin();
  }, [generateTvPin]);

  useEffect(() => {
    if (!activePinSession) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((activePinSession.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        void generateTvPin();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activePinSession, generateTvPin]);

  const rawPin = activePinSession?.pin || "------";
  const formattedPin = rawPin.length === 6 ? `${rawPin.slice(0, 3)} - ${rawPin.slice(3)}` : rawPin;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerString = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  const isConnected = !!activePinSession?.pairedDeviceName || pairedDevices.length > 0;
  const connectedName = activePinSession?.pairedDeviceName || pairedDevices[0]?.name || "Connected Phone";

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Math.max(insets.top, Math.round(stage.gutter * 0.4)), paddingBottom: insets.bottom },
      ]}
    >
      <AmbientGlow />

      <View style={[styles.header, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          onFocus={() => setFocused("back")}
          onBlur={() => setFocused(null)}
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[
            styles.backBtn,
            {
              width: stage.controlSize,
              height: stage.controlSize,
              borderRadius: stage.controlSize / 2,
              borderColor: focused === "back" ? palette.accentBright : palette.glassStrokeBright,
            },
            focused === "back" && styles.focusedGlow,
          ]}
        >
          <ChevronLeft size={Math.round(stage.u * 2.8)} color="#FFFFFF" />
        </Pressable>
        <Text style={{ color: "#FFFFFF", fontSize: stage.railTitleSize, fontWeight: "800" }}>
          Connect Phone to Android TV
        </Text>
      </View>

      <View
        style={[
          styles.container,
          {
            paddingHorizontal: stage.gutter,
            paddingTop: stage.gutter * 0.5,
            gap: stage.cardGap * 1.5,
          },
        ]}
      >
        <Text style={{ color: palette.textSecondary, fontSize: stage.bodySize, maxWidth: stage.width * 0.8 }}>
          Seamlessly link your mobile device to sync your Watchlist and playback history between your phone and your
          television.
        </Text>

        <View style={styles.contentRow}>
          {/* Main PIN Pedestal */}
          <GlassPanel
            variant="prominent"
            glow={palette.accentGlow}
            style={{ flex: 1 }}
            contentStyle={[
              styles.pedestal,
              {
                padding: stage.cardGap * 2,
                borderRadius: radius.card,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <View style={styles.iconBadge}>
              <Tv size={28} color={palette.accentBright} />
            </View>

            <Text style={[styles.pedestalHeading, { fontSize: stage.metaSize }]}>ENTER THIS PIN ON YOUR PHONE</Text>

            <View style={styles.pinDisplay}>
              <Text style={[styles.pinDigits, { fontSize: Math.round(stage.titleSize * 1.6) }]}>
                {formattedPin}
              </Text>
            </View>

            <View style={styles.timerRow}>
              <Text style={styles.timerLabel}>Expires in {timerString}</Text>
            </View>

            {isConnected ? (
              <View style={styles.connectedBadge}>
                <CheckCircle2 size={18} color="#34A853" />
                <Text style={styles.connectedText}>Linked: {connectedName}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                play("tap");
                void generateTvPin();
              }}
              onFocus={() => setFocused("refresh")}
              onBlur={() => setFocused(null)}
              accessibilityRole="button"
              accessibilityLabel="Generate New PIN"
              style={[
                styles.refreshBtn,
                {
                  borderColor: focused === "refresh" ? palette.accentBright : palette.glassStrokeBright,
                },
                focused === "refresh" && styles.focusedGlow,
              ]}
            >
              <RefreshCw size={18} color="#FFFFFF" />
              <Text style={styles.refreshText}>Generate New PIN</Text>
            </Pressable>
          </GlassPanel>

          {/* Step by Step Instructions */}
          <GlassPanel
            variant="card"
            style={{ flex: 1 }}
            contentStyle={[
              styles.instructions,
              {
                padding: stage.cardGap * 1.8,
                borderRadius: radius.card,
                justifyContent: "center",
                gap: stage.cardGap,
              },
            ]}
          >
            <Text style={{ color: "#FFFFFF", fontSize: stage.bodySize, fontWeight: "800", marginBottom: 8 }}>
              How to Connect:
            </Text>

            <View style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepDigit}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>Open Hallyu TV on Phone</Text>
                <Text style={styles.stepSubtitle}>Launch the mobile app on your smartphone or tablet.</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepDigit}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>Navigate to Profile</Text>
                <Text style={styles.stepSubtitle}>Tap on Profile (My Space) &gt; "Connect Android TV".</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepDigit}>3</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>Enter 6-Digit PIN</Text>
                <Text style={styles.stepSubtitle}>Type the code shown here to sync Watchlist and History.</Text>
              </View>
            </View>
          </GlassPanel>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: "row", alignItems: "center" },
  backBtn: {
    backgroundColor: palette.glassFillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  contentRow: { flexDirection: "row", gap: 20, flex: 1 },
  pedestal: {
    borderWidth: 1,
    borderColor: palette.glassStrokeBright,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 94, 58, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 58, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  pedestalHeading: {
    color: palette.accentBright,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pinDisplay: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: 12,
  },
  pinDigits: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 6,
    textAlign: "center",
    textShadowColor: palette.accent,
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
  },
  timerRow: { marginBottom: 16 },
  timerLabel: { color: palette.textMuted, fontSize: 13, fontWeight: "600" },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(52, 168, 83, 0.15)",
    borderColor: "rgba(52, 168, 83, 0.35)",
    borderWidth: 1,
    borderRadius: radius.pill,
    marginBottom: 16,
  },
  connectedText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  refreshText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  instructions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.glassFillUltra,
    borderWidth: 1,
    borderColor: palette.accentBright,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDigit: { color: palette.accentBright, fontSize: 14, fontWeight: "800" },
  stepTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  stepSubtitle: { color: palette.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  focusedGlow: {
    transform: [{ scale: 1.04 }],
    shadowColor: palette.accent,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
});
