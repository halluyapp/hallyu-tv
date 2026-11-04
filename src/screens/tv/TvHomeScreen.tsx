import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { APP_NAME } from "@/config/branding";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchHome } from "@/services/provider/adapter";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Search, RefreshCw, Download } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Independent 10-foot TV home. Catalogue comes straight from Zarhosting;
 * Continue Watching / Watchlist are this TV's own local library. No phone,
 * pairing, account, or sync service is involved.
 */
export function TvHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSections(await fetchHome());
    } catch (err) {
      setLoadError(err instanceof ProviderError ? err.message : "The catalogue could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (detailPath: string, subjectId: string) => {
    navigation.navigate("Details", { detailPath, subjectId });
  };

  const hero = sections?.find((s) => s.section === "Banner")?.items[0] ?? sections?.[0]?.items[0] ?? null;
  const rails = (sections ?? []).filter((s) => s.items.length > 0 && s.section !== "Banner");
  const resume = progress.filter((p) => !p.completed && p.position_seconds > 5).slice(0, 20);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
          <Text style={styles.tagline}>The big screen, on its own terms</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("TvDownloads")} style={styles.searchBtn}>
            <Download size={16} color={palette.textPrimary} />
            <Text style={styles.searchText}>Downloads</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("TvSearch")} style={styles.searchBtn} hasTVPreferredFocus>
            <Search size={16} color={palette.textPrimary} />
            <Text style={styles.searchText}>Search</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {hero ? (
          <Pressable onPress={() => open(hero.slug, hero.subjectId)} style={styles.hero}>
            {hero.posterUrl ? <Image source={{ uri: hero.posterUrl }} style={styles.heroImage} resizeMode="cover" /> : null}
            <View style={styles.heroScrim} />
            <View style={styles.heroContent}>
              <Text style={styles.heroBadge}>Featured</Text>
              <Text numberOfLines={2} style={styles.heroTitle}>{hero.name}</Text>
              <Text style={styles.heroMeta}>
                {[hero.year, hero.genre, hero.rating && `★ ${hero.rating}`].filter(Boolean).join(" · ")}
              </Text>
              <View style={styles.heroPlay}>
                <Text style={styles.heroPlayText}>Open</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {resume.length > 0 ? (
          <ProgressRowView label="Continue watching" items={resume} onOpen={(item) => item.detail_path && open(item.detail_path, item.subject_id)} />
        ) : null}

        {rails.map((s) => (
          <Rail key={s.section} label={sectionLabel(s.section)} items={s.items} onOpen={(item) => open(item.slug, item.subjectId)} />
        ))}

        {watchlist.length > 0 ? (
          <LibraryRow label="Watchlist" items={watchlist} onOpen={(item) => item.detail_path && open(item.detail_path, item.subject_id)} />
        ) : null}

        {loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{loadError}</Text>
            <Pressable onPress={() => void load()} style={[styles.searchBtn, { marginTop: spacing.md }]}>
              <RefreshCw size={15} color={palette.textPrimary} />
              <Text style={styles.searchText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!sections && !loadError ? (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function sectionLabel(raw: string): string {
  const t = raw.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Rail({ label, items, onOpen }: { label: string; items: CatalogueItem[]; onOpen: (item: CatalogueItem) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item, idx) => (
          <Pressable
            key={`${item.subjectId}_${item.slug}`}
            onPress={() => onOpen(item)}
            onFocus={() => setFocusedIdx(idx)}
            onBlur={() => setFocusedIdx(null)}
            style={[styles.tile, focusedIdx === idx && styles.tileFocused]}
          >
            {item.posterUrl ? (
              <Image source={{ uri: item.posterUrl }} style={styles.tilePoster} resizeMode="cover" />
            ) : (
              <View style={[styles.tilePoster, { backgroundColor: palette.surfaceRaised }]} />
            )}
            <Text style={styles.tileTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.tileMeta}>
              {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ProgressRowView({ label, items, onOpen }: { label: string; items: ProgressRow[]; onOpen: (item: ProgressRow) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item, idx) => {
          const pct = item.duration_seconds > 0 ? Math.round((item.position_seconds / item.duration_seconds) * 100) : null;
          return (
            <Pressable
              key={`${item.subject_id}_${item.season_number ?? 0}_${item.episode_number ?? 0}`}
              onPress={() => onOpen(item)}
              onFocus={() => setFocusedIdx(idx)}
              onBlur={() => setFocusedIdx(null)}
              style={[styles.tile, focusedIdx === idx && styles.tileFocused]}
            >
              {item.poster_url ? (
                <Image source={{ uri: item.poster_url }} style={styles.tilePoster} resizeMode="cover" />
              ) : (
                <View style={[styles.tilePoster, { backgroundColor: palette.surfaceRaised }]} />
              )}
              {pct !== null && pct > 0 ? <View style={[styles.tileBar, { width: `${Math.min(100, pct)}%` }]} /> : null}
              <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.tileMeta}>
                {item.media_type === "series" ? `S${item.season_number ?? 1} E${item.episode_number ?? 1}` : "Movie"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function LibraryRow({ label, items, onOpen }: { label: string; items: LibraryTitle[]; onOpen: (item: LibraryTitle) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item, idx) => (
          <Pressable
            key={item.subject_id}
            onPress={() => onOpen(item)}
            onFocus={() => setFocusedIdx(idx)}
            onBlur={() => setFocusedIdx(null)}
            style={[styles.tile, focusedIdx === idx && styles.tileFocused]}
          >
            {item.poster_url ? (
              <Image source={{ uri: item.poster_url }} style={styles.tilePoster} resizeMode="cover" />
            ) : (
              <View style={[styles.tilePoster, { backgroundColor: palette.surfaceRaised }]} />
            )}
            <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.tileMeta}>{item.media_type === "series" ? "Series" : "Movie"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: { flexDirection: "row", gap: spacing.md },
  brand: { ...typeScale.display, color: palette.accent, letterSpacing: 4 },
  tagline: { ...typeScale.caption, color: palette.textMuted, marginTop: 2 },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchText: { color: palette.textPrimary, fontSize: 14, fontWeight: "700" },
  hero: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    height: 300,
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,10,13,0.55)" },
  heroContent: { position: "absolute", left: spacing.xxl, bottom: spacing.xl, right: spacing.xxl, gap: spacing.xs },
  heroBadge: { color: palette.accent, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heroTitle: { ...typeScale.display, color: palette.textPrimary, fontSize: 34, lineHeight: 40 },
  heroMeta: { color: palette.textSecondary, fontSize: 13 },
  heroPlay: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  heroPlayText: { color: "#160B08", fontWeight: "800", fontSize: 14 },
  rowLabel: { ...typeScale.micro, color: palette.textSecondary, paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  row: { paddingHorizontal: spacing.xxl, gap: spacing.lg },
  tile: { width: 170, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  tileFocused: { transform: [{ scale: 1.07 }], borderColor: palette.accent, borderWidth: 2, backgroundColor: palette.surfaceRaised },
  tilePoster: { width: 170, height: 96, backgroundColor: palette.surfaceRaised },
  tileBar: { position: "absolute", bottom: 38, left: 0, height: 3, backgroundColor: palette.accent },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  tileMeta: { color: palette.textMuted, fontSize: 10, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  errorBox: { alignItems: "center", paddingVertical: spacing.xxl },
  errorTitle: { color: palette.danger, textAlign: "center" },
});
