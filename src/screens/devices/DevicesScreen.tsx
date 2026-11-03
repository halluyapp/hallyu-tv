import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/services/supabase";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tv, Smartphone, Trash2, ShieldCheck, RefreshCw, Plus } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { approvePairing } from "@/services/pairing";

interface DeviceRow {
  id: string;
  device_name: string | null;
  device_type: string | null;
  created_at: string;
}

/** Account ↔ device link management. Session secrets are hashed at rest; phones can revoke but never read them. */
export function DevicesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairMsg, setPairMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("devices")
      .select("id, device_name, device_type, created_at")
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    setDevices((data as DeviceRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = (d: DeviceRow) =>
    Alert.alert("Unlink device?", `“${d.device_name ?? "Device"}” will need to pair again to sync.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await supabase.from("devices").delete().eq("id", d.id);
            void load();
          })();
        },
      },
    ]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl }}>
      <Text style={styles.title}>Devices</Text>
      <Text style={styles.subtitle}>
        Pairing binds a TV to your account with a single-use 6-digit code and a hashed session secret. This app never
        stores or transmits the secret in plain text.
      </Text>

      {loading ? (
        <ActivityIndicator color={palette.accent} style={{ marginTop: spacing.xxl }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : devices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Tv size={28} color={palette.textMuted} />
          <Text style={styles.emptyTitle}>No linked devices</Text>
          <Text style={styles.emptyBody}>On your TV, install the app and enter the pairing code shown on this screen's counterpart.</Text>
        </View>
      ) : (
        devices.map((d) => (
          <View key={d.id} style={styles.device}>
            {d.device_type === "tv" ? <Tv size={20} color={palette.accentBright} /> : <Smartphone size={20} color={palette.textSecondary} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{d.device_name ?? "Device"}</Text>
              <Text style={styles.deviceMeta}>
                {(d.device_type ?? "phone") === "tv" ? "TV" : "Mobile"} · linked {new Date(d.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Pressable onPress={() => revoke(d)} style={styles.revokeBtn}>
              <Trash2 size={15} color={palette.danger} />
            </Pressable>
          </View>
        ))
      )}

      <SectionHeading label="Pair a TV" />
      <View style={styles.pairCard}>
        <Text style={styles.pairHint}>Enter the 6-digit code shown on your TV.</Text>
        <View style={styles.pairRow}>
          <TextInput
            style={styles.pairInput}
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={palette.textMuted}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable
            style={[styles.pairBtn, (pairing || codeInput.length !== 6) && { opacity: 0.5 }]}
            disabled={pairing || codeInput.length !== 6}
            onPress={() => {
              void (async () => {
                setPairing(true);
                setPairMsg(null);
                try {
                  const token = await SecureStore.getItemAsync("access_token");
                  if (!token) throw new Error("Sign in first");
                  await approvePairing(token, codeInput);
                  setPairMsg("TV paired successfully");
                  setCodeInput("");
                  void load();
                } catch (err) {
                  setPairMsg(err instanceof Error ? err.message : "Pairing failed");
                } finally {
                  setPairing(false);
                }
              })();
            }}
          >
            <Plus size={15} color={palette.textPrimary} />
            <Text style={styles.pairBtnText}>{pairing ? "Pairing…" : "Approve"}</Text>
          </Pressable>
        </View>
        {pairMsg ? <Text style={pairMsg.includes("success") ? styles.pairOk : styles.error}>{pairMsg}</Text> : null}
      </View>

      <View style={styles.noteRow}>
        <ShieldCheck size={13} color={palette.success} />
        <Text style={styles.noteText}>
          Unlinking invalidates the device's session on its next sync attempt — the TV shows the pairing screen again.
        </Text>
      </View>
      <Pressable onPress={() => void load()} style={styles.refreshBtn}>
        <RefreshCw size={14} color={palette.textSecondary} />
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionHeading({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  title: { ...typeScale.title, color: palette.textPrimary, paddingHorizontal: spacing.xl },
  subtitle: { color: palette.textMuted, lineHeight: 19, paddingHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.xl },
  device: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  deviceName: { ...typeScale.headline, color: palette.textPrimary },
  deviceMeta: { color: palette.textMuted, fontSize: 12 },
  revokeBtn: { padding: spacing.sm },
  error: { color: palette.danger, paddingHorizontal: spacing.xl },
  emptyCard: { alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.xl, padding: spacing.xxl, backgroundColor: palette.glassFill, borderColor: palette.glassStroke, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card },
  emptyTitle: { ...typeScale.headline, color: palette.textPrimary },
  emptyBody: { color: palette.textMuted, textAlign: "center", lineHeight: 19 },
  noteRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg, alignItems: "flex-start" },
  noteText: { color: palette.textMuted, fontSize: 11, flex: 1, lineHeight: 16 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "center", marginTop: spacing.xl, padding: spacing.md },
  refreshText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  pairCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pairHint: { color: palette.textSecondary, fontSize: 13 },
  pairRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  pairInput: {
    flex: 1,
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.sm,
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
  pairBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.accent, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  pairBtnText: { color: palette.textPrimary, fontWeight: "800", fontSize: 13 },
  pairOk: { color: palette.success, fontSize: 12 },
  sectionLabel: { ...typeScale.micro, color: palette.textSecondary, paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.sm },
});
