import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { consumePairing, createTvChallenge } from "@/services/pairing";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { Tv } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEVICE_NAME = `${(Platform.constants as { Manufacturer?: string }).Manufacturer ?? "Living Room"} TV`;

/**
 * TV-side pairing-first experience. Generates a nonce, shows a 6-digit code,
 * and polls pairing-consume until the phone approves. The session secret comes
 * back once and is stored in the TV's secure storage.
 */
export function TvPairScreen() {
  const navigation = useNavigation<Nav>();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const nonceRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function begin() {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      nonceRef.current = nonce;
      try {
        const challenge = await createTvChallenge(DEVICE_NAME, nonce);
        if (cancelled) return;
        setCode(challenge.code);
        setExpiresAt(challenge.expires_at);

        // Poll until the phone approves; consume is single-use + nonce-bound.
        const poll = async () => {
          if (cancelled) return;
          try {
            const res = await consumePairing(challenge.code, nonce);
            if (cancelled) return;
            await SecureStore.setItemAsync("tv_device_id", res.device_id);
            await SecureStore.setItemAsync("tv_session_secret", res.session_secret);
            setApproved(true);
            setTimeout(() => {
              if (!cancelled) navigation.replace("TvHome");
            }, 900);
            return;
          } catch {
            pollTimer = setTimeout(poll, 4000);
          }
        };
        void poll();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Pairing service unreachable");
      }
    }
    void begin();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [navigation]);

  const retry = () => navigation.replace("TvPairing");

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Tv size={44} color={palette.accentBright} />
      </View>
      <Text style={styles.title}>Pair with your phone</Text>
      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={retry} hasTVPreferredFocus>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </>
      ) : approved ? (
        <Text style={styles.codeLabel}>Paired — opening your library…</Text>
      ) : code ? (
        <>
          <Text style={styles.instruction}>Open the app on your phone, go to My Space → Devices, and enter this code.</Text>
          <View style={styles.codePanel}>
            <Text style={styles.code}>{code.slice(0, 3)} {code.slice(3)}</Text>
            <Text style={styles.expiry}>
              {expiresAt ? `Valid until ${new Date(expiresAt).toLocaleTimeString()}` : ""}
            </Text>
          </View>
          <View style={styles.qrWrap}>
            <QRCode value={code} size={110} backgroundColor="transparent" color={palette.textPrimary} />
          </View>
          <Text style={styles.waiting}>Waiting for approval…</Text>
        </>
      ) : (
        <Text style={styles.waiting}>Contacting pairing service…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  iconWrap: {
    width: 96, height: 96, borderRadius: 24,
    backgroundColor: palette.emberGlow,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: palette.accentSoft,
  },
  title: { ...typeScale.display, color: palette.textPrimary, textAlign: "center" },
  instruction: { color: palette.textSecondary, textAlign: "center", lineHeight: 22, maxWidth: 560 },
  codePanel: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.accent,
    borderWidth: 1.5,
    borderRadius: radius.card,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  code: { fontSize: 54, fontWeight: "900", letterSpacing: 10, color: palette.textPrimary },
  expiry: { color: palette.textMuted, fontSize: 12, marginTop: spacing.xs },
  codeLabel: { ...typeScale.headline, color: palette.success },
  waiting: { color: palette.textMuted },
  error: { color: palette.danger, textAlign: "center" },
  retryBtn: { backgroundColor: palette.accent, borderRadius: radius.pill, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  retryText: { color: palette.textPrimary, fontWeight: "800" },
  qrWrap: { padding: spacing.md, backgroundColor: palette.glassFill, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.glassStroke },
});
