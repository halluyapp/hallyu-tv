import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { APP_NAME } from "@/config/branding";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchHome } from "@/services/provider/adapter";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { useLibrary, type LibraryTitle, type ProgressRow } from "@/state/LibraryContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Search, RefreshCw, Download, Home as HomeIcon } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TILE_WIDTH = 170;
const TILE_PITCH = TILE_WIDTH + spacing.lg;

/**
 * 10-foot TV home: a focusable side rail (Home / Search / Downloads) beside
 * hero + catalogue rails. Rows are virtualized and d-pad focus auto-scrolls
 * the rail so the focused tile is always in view.
 */
export function TvHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { progress, watchlist } = useLibrary();
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [railFocused, setRailFocused] = useState<string | null>(null);

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

  const railItems: { key: string; label: string; icon: typeof Search; onPress: () => void }[] = [
    { key: "home", label: "Home", icon: HomeIcon, onPress: () => {} },
    { key: "search", label: "Search", icon: Search, onPress: () => navigation.navigate("TvSearch") },
    { key: "downloads", label: "Downloads", icon: Download, onPress: () => navigation.navigate("TvDownloads") },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.bodyRow}>
        {/* Side rail */}
        <View style={styles.sideRail}>
          <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
          <Text style={styles.tagline}>The big screen, on its own terms</Text>
          <View style={styles.railNav}>
            {railItems.map((item) => {
              const Icon = item.icon;
              const active = railFocused === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  onFocus={() => setRailFocused(item.key)}
                  onBlur={() => setRailFocused(null)}
                  hasTVPreferredFocus={item.key === "home"}
                  style={[styles.railBtn, active && styles.railBtnActive]}
                >
                  <Icon size={17} color={active ? "#160B08" : palette.textPrimary} />
                  <Text style={[styles.railBtnLabel, active && styles.railBtnLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }} style={styles.content}>
          {hero ? (
            <Pressable onPress={() => open(hero.slug, hero.subjectId)} style={styles.hero}>
              <Poster uri={hero.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(hero.name)} />
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
              <Pressable onPress={() => void load()} style={[styles.pillBtn, { marginTop: spacing.md }]}>
                <RefreshCw size={15} color={palette.textPrimary} />
                <Text style={styles.pillBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!sections && !loadError ? (
            <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} />
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function sectionLabel(raw: string): string {
  const t = raw.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Horizontal rail that keeps the d-pad-focused tile inside the viewport. */
function Rail({ label, items, onOpen }: { label: string; items: CatalogueItem[]; onOpen: (item: CatalogueItem) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const listRef = useRef<FlatList<CatalogueItem> | null>(null);

  const onFocusTile = (idx: number) => {
    setFocusedIdx(idx);
    if (idx >= 2) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 });
  };

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <FlatList
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        data={items}
        keyExtractor={(item) => `${item.subjectId}_${item.slug}`}
        getItemLayout={(_, index) => ({ length: TILE_PITCH, offset: TILE_PITCH * index, index })}
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, info.index * TILE_PITCH - 100), animated: true });
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onOpen(item)}
            onFocus={() => onFocusTile(index)}
            onBlur={() => setFocusedIdx(null)}
            style={[styles.tile, focusedIdx === index && styles.tileFocused]}
          >
            <Poster uri={item.posterUrl} style={styles.tilePoster} initials={initialsFor(item.name)} />
            <Text style={styles.tileTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.tileMeta}>
              {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function ProgressRowView({ label, items, onOpen }: { label: string; items: ProgressRow[]; onOpen: (item: ProgressRow) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const listRef = useRef<FlatList<ProgressRow> | null>(null);

  const onFocusTile = (idx: number) => {
    setFocusedIdx(idx);
    if (idx >= 2) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 });
  };

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <FlatList
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        data={items}
        keyExtractor={(item) => `${item.subject_id}_${item.season_number ?? 0}_${item.episode_number ?? 0}`}
        getItemLayout={(_, index) => ({ length: TILE_PITCH, offset: TILE_PITCH * index, index })}
        windowSize={5}
        initialNumToRender={8}
        removeClippedSubviews
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, info.index * TILE_PITCH - 100), animated: true });
        }}
        renderItem={({ item, index }) => {
          const pct = item.duration_seconds > 0 ? Math.round((item.position_seconds / item.duration_seconds) * 100) : null;
          return (
            <Pressable
              onPress={() => onOpen(item)}
              onFocus={() => onFocusTile(index)}
              onBlur={() => setFocusedIdx(null)}
              style={[styles.tile, focusedIdx === index && styles.tileFocused]}
            >
              <View style={styles.tilePosterWrap}>
                <Poster uri={item.poster_url} style={styles.tilePoster} initials={initialsFor(item.title)} />
                {pct !== null && pct > 0 ? <View style={[styles.tileBar, { width: `${Math.min(100, pct)}%` }]} /> : null}
              </View>
              <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.tileMeta}>
                {item.media_type === "series" ? `S${item.season_number ?? 1} E${item.episode_number ?? 1}` : "Movie"}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function LibraryRow({ label, items, onOpen }: { label: string; items: LibraryTitle[]; onOpen: (item: LibraryTitle) => void }) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const listRef = useRef<FlatList<LibraryTitle> | null>(null);

  const onFocusTile = (idx: number) => {
    setFocusedIdx(idx);
    if (idx >= 2) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 });
  };

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <FlatList
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        data={items}
        keyExtractor={(item) => item.subject_id}
        getItemLayout={(_, index) => ({ length: TILE_PITCH, offset: TILE_PITCH * index, index })}
        windowSize={5}
        initialNumToRender={8}
        removeClippedSubviews
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, info.index * TILE_PITCH - 100), animated: true });
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onOpen(item)}
            onFocus={() => onFocusTile(index)}
            onBlur={() => setFocusedIdx(null)}
            style={[styles.tile, focusedIdx === index && styles.tileFocused]}
          >
            <Poster uri={item.poster_url} style={styles.tilePoster} initials={initialsFor(item.title)} />
            <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.tileMeta}>{item.media_type === "series" ? "Series" : "Movie"}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  bodyRow: { flex: 1, flexDirection: "row" },
  sideRail: {
    width: 220,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.glassStroke,
  },
  brand: { ...typeScale.display, color: palette.accent, letterSpacing: 4, fontSize: 24 },
  tagline: { ...typeScale.caption, color: palette.textMuted, marginTop: 2, marginBottom: spacing.xxl },
  railNav: { gap: spacing.md },
  railBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  railBtnActive: { borderColor: palette.accent, backgroundColor: "rgba(240,120,85,0.14)" },
  railBtnLabel: { color: palette.textPrimary, fontSize: 15, fontWeight: "700" },
  railBtnLabelActive: { color: "#160B08" },
  content: { flex: 1 },
  pillBtn: {
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
  pillBtnText: { color: palette.textPrimary, fontSize: 14, fontWeight: "700" },
  hero: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    height: 300,
  },
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
  tile: { width: TILE_WIDTH, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  tileFocused: { transform: [{ scale: 1.07 }], borderColor: palette.accent, borderWidth: 2, backgroundColor: palette.surfaceRaised },
  tilePosterWrap: { overflow: "hidden" },
  tilePoster: { width: TILE_WIDTH, height: 96, backgroundColor: palette.surfaceRaised },
  tileBar: { position: "absolute", bottom: 0, left: 0, height: 3, backgroundColor: palette.accent },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  tileMeta: { color: palette.textMuted, fontSize: 10, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  errorBox: { alignItems: "center", paddingVertical: spacing.xxl },
  errorTitle: { color: palette.danger, textAlign: "center" },
});
