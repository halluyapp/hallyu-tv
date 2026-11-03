import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { APP_NAME } from "@/config/branding";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { tvSync } from "@/services/pairing";
import * as SecureStore from "expo-secure-store";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Play, RefreshCw } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface TvLibraryItem {
  subject_id: string;
  detail_path: string | null;
  media_type: "movie" | "series";
  title: string;
  poster_url: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  position_seconds?: number;
  duration_seconds?: number;
  completed?: boolean;
}

/**
 * 10-foot TV home. Library state syncs through the device session (tv-sync
 * edge function) — no user OAuth token is ever stored on the TV.
 */
export function TvHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [state, setState] = useState<{ watchlist: TvLibraryItem[]; resume: TvLibraryItem[] }>({ watchlist: [], resume: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await SecureStore.getItemAsync("tv_device_id");
      const secret = await SecureStore.getItemAsync("tv_session_secret");
      if (!deviceId || !secret) throw new Error("Not paired");
      const res = await tvSync<{ watchlist: TvLibraryItem[]; resume: TvLibraryItem[] }>(deviceId, secret, "get_state");
      setState({ watchlist: res.watchlist ?? [], resume: res.resume ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const open = (item: TvLibraryItem) => {
    if (!item.detail_path) return;
    // Details always requires an explicit focus + select: nothing auto-plays.
    navigation.navigate("Details", { detailPath: item.detail_path, subjectId: item.subject_id });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingVertical: spacing.xxl }}>
      <View style={styles.header}>
        <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
        <Text style={styles.tagline}>Your library, on the big screen</Text>
        <Pressable style={[styles.syncBtn, loading && { opacity: 0.5 }]} onPress={() => void sync()}>
          <RefreshCw size={15} color={palette.textSecondary} />
          <Text style={styles.syncText}>{loading ? "Syncing…" : "Sync"}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error}>{error} — press Sync to retry, or re-pair from your phone.</Text>
      ) : null}

      {!loading && !error && state.resume.length === 0 && state.watchlist.length === 0 ? (
        <View style={styles.empty}>
          <Play size={28} color={palette.textMuted} />
          <Text style={styles.emptyTitle}>Nothing synced yet</Text>
          <Text style={styles.emptyBody}>Add to your watchlist or start a title on your phone — it appears here.</Text>
        </View>
      ) : null}

      {state.resume.length > 0 ? (
        <Row label="Continue watching" items={state.resume} onOpen={open} hasTVPreferredFocus />
      ) : null}
      {state.watchlist.length > 0 ? <Row label="Watchlist" items={state.watchlist} onOpen={open} /> : null}
    </ScrollView>
  );
}

function Row({
  label,
  items,
  onOpen,
  hasTVPreferredFocus,
}: {
  label: string;
  items: TvLibraryItem[];
  onOpen: (item: TvLibraryItem) => void;
  hasTVPreferredFocus?: boolean;
}) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item, idx) => {
          const pct =
            item.duration_seconds && item.duration_seconds > 0
              ? Math.round(((item.position_seconds ?? 0) / item.duration_seconds) * 100)
              : null;
          return (
            <Pressable
              key={`${item.subject_id}_${item.season_number ?? 0}_${item.episode_number ?? 0}`}
              onPress={() => onOpen(item)}
              onFocus={() => setFocusedIdx(idx)}
              onBlur={() => setFocusedIdx(null)}
              hasTVPreferredFocus={hasTVPreferredFocus && idx === 0}
              style={[styles.tile, focusedIdx === idx && styles.tileFocused]}
            >
              {item.poster_url ? (
                <Image source={{ uri: item.poster_url }} style={styles.tilePoster} />
              ) : (
                <View style={[styles.tilePoster, { backgroundColor: palette.surfaceRaised }]} />
              )}
              {pct !== null && pct > 0 && !item.completed ? <View style={[styles.tileBar, { width: `${Math.min(100, pct)}%` }]} /> : null}
              <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
              {item.media_type === "series" && item.season_number ? (
                <Text style={styles.tileMeta}>S{item.season_number} E{item.episode_number ?? 1}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { paddingHorizontal: spacing.xxl, marginBottom: spacing.xl, flexDirection: "row", alignItems: "baseline", gap: spacing.md },
  brand: { ...typeScale.display, color: palette.accent, letterSpacing: 4 },
  tagline: { ...typeScale.caption, color: palette.textMuted, flex: 1 },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.glassStroke, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  syncText: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  error: { color: palette.danger, paddingHorizontal: spacing.xxl, marginBottom: spacing.lg, lineHeight: 20 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { ...typeScale.headline, color: palette.textPrimary },
  emptyBody: { color: palette.textMuted },
  rowLabel: { ...typeScale.micro, color: palette.textSecondary, paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  row: { paddingHorizontal: spacing.xxl, gap: spacing.lg },
  tile: { width: 150, borderRadius: radius.md, overflow: "hidden", transform: [{ scale: 1 }], backgroundColor: palette.surface },
  tileFocused: { transform: [{ scale: 1.06 }], borderColor: palette.accent, borderWidth: 2, backgroundColor: palette.surfaceRaised },
  tilePoster: { width: 150, height: 84, backgroundColor: palette.surfaceRaised },
  tileBar: { position: "absolute", bottom: 34, left: 0, height: 3, backgroundColor: palette.accent },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  tileMeta: { color: palette.textMuted, fontSize: 10, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
});
