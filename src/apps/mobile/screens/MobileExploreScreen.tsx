import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { type CompositeNavigationProp, type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_TAB_BAR_CLEARANCE } from "@/apps/mobile/components/MobileTabBar";
import type { MobileStackParamList, MobileTabParamList } from "@/apps/mobile/navigation/mobileTypes";
import { palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { searchCatalogue } from "@/services/provider/adapter";
import {
  hydrateWorldFirstPage,
  loadWorldPage,
  MOBILE_EXPLORE_WORLDS,
  WORLD_DEFINITIONS,
  type WorldId,
} from "@/services/provider/categories";
import { prefetchDetail } from "@/services/provider/detailCache";
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
} from "@/services/searchHistory";
import type { CatalogueItem } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { GlassPosterGridSkeleton } from "@/ui/glass/GlassSkeleton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type ExploreNav = CompositeNavigationProp<
  BottomTabNavigationProp<MobileTabParamList, "Explore">,
  NativeStackNavigationProp<MobileStackParamList>
>;
type ExploreRoute = RouteProp<MobileTabParamList, "Explore">;

/**
 * 1:1 Hallyu Mobile Explore & Search Screen (`docs/ui-previews/mobile-02-discover-search.png`):
 * - Floating Frosted Liquid Glass Search Bar capsule
 * - Dismissible Recent Searches frosted glass chips ('Moving x', 'Queen of Tears x'…)
 * - Horizontal Liquid Glass World/Genre filter pills ('All', 'K-Drama', 'C-Drama', 'Anime'…)
 * - Fast virtualized 3-column poster grid with accurate multi-page query pagination
 */
export function MobileExploreScreen() {
  const navigation = useNavigation<ExploreNav>();
  const route = useRoute<ExploreRoute>();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const profile = usePerformanceProfile();

  const [query, setQuery] = useState("");
  const [worldId, setWorldId] = useState<WorldId>(route.params?.initialWorld ?? "kdrama");
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadRecentSearches().then(setRecent).catch(() => {});
  }, []);

  useEffect(() => {
    if (route.params?.initialWorld) {
      setWorldId(route.params.initialWorld);
    }
    if (route.params?.autoFocusSearch) {
      setTimeout(() => inputRef.current?.focus(), 140);
    }
  }, [route.params?.autoFocusSearch, route.params?.initialWorld]);

  const isSearchMode = query.trim().length >= 2;

  const loadFirstPage = useCallback(async () => {
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setLoading(true);

    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      try {
        const res = await searchCatalogue(trimmed, 1, controller.signal);
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setItems(res.items);
        setPage(1);
        setTotalPages(res.totalPages);
        if (trimmed.length >= 3 && res.items.length > 0) {
          addRecentSearch(trimmed).then(setRecent).catch(() => {});
        }
      } catch {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setError("Search could not complete. Check your connection and try again.");
      } finally {
        if (seq === seqRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
      return;
    }

    const cached = await hydrateWorldFirstPage(worldId);
    if (seq === seqRef.current && cached && cached.length > 0) {
      setItems(cached);
      setLoading(false);
    }

    try {
      const res = await loadWorldPage(worldId, 1, "all", controller.signal);
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setItems(res.items);
      setPage(1);
      setTotalPages(res.totalPages);
    } catch {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      if (!cached || cached.length === 0) {
        setError("Could not load titles right now. Tap Retry.");
      }
    } finally {
      if (seq === seqRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [query, worldId]);

  useEffect(() => {
    const delay = query.trim().length >= 2 ? 260 : 0;
    const timer = setTimeout(() => {
      void loadFirstPage();
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [loadFirstPage, query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    const seq = seqRef.current;
    const trimmed = query.trim();
    setLoadingMore(true);
    try {
      const res =
        trimmed.length >= 2
          ? await searchCatalogue(trimmed, nextPage)
          : await loadWorldPage(worldId, nextPage, "all");
      if (seq !== seqRef.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.subjectId));
        const extra = res.items.filter((i) => !seen.has(i.subjectId));
        return [...prev, ...extra];
      });
      setPage(nextPage);
      setTotalPages(res.totalPages);
    } catch {
      // Ignore silent next-page error
    } finally {
      if (seq === seqRef.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, page, query, totalPages, worldId]);

  const gap = 10;
  const posterWidth = useMemo(
    () => Math.floor((stage.width - 36 - gap * 2) / 3),
    [stage.width],
  );

  const openItem = useCallback(
    (item: CatalogueItem) => {
      prefetchDetail(item.slug);
      if (query.trim().length >= 2) {
        addRecentSearch(query.trim()).then(setRecent).catch(() => {});
      }
      navigation.navigate("MobileDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation, query],
  );

  const rowHeight = Math.round((posterWidth * 3) / 2) + 52;

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={items[0]?.posterUrl} intensity="medium" />

      <FlatList
        data={items}
        numColumns={3}
        keyExtractor={(item) => item.subjectId}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        windowSize={profile.listWindowSize}
        maxToRenderPerBatch={profile.maxToRenderPerBatch * 2}
        initialNumToRender={9}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: rowHeight,
          offset: rowHeight * Math.floor(index / 3),
          index,
        })}
        onEndReachedThreshold={0.45}
        onEndReached={loadNextPage}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + MOBILE_TAB_BAR_CLEARANCE,
        }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Floating Frosted Liquid Glass Search Bar Capsule */}
            <View style={styles.padH}>
              <LiquidGlassView
                variant="frosted"
                borderRadius={radius.pill}
                blurIntensity={40}
                contentStyle={styles.searchBarInner}
              >
                <Search size={18} color={palette.textSecondary} />
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search movies, K-dramas, anime…"
                  placeholderTextColor={palette.textMuted}
                  returnKeyType="search"
                  autoCorrect={false}
                  style={styles.textInput}
                />
                {query.length > 0 ? (
                  <Pressable
                    accessible
                    accessibilityLabel="Clear search"
                    onPress={() => setQuery("")}
                    style={styles.clearIconBtn}
                  >
                    <X size={15} color="#090D14" />
                  </Pressable>
                ) : null}
              </LiquidGlassView>
            </View>

            {/* Dismissible Recent Searches Frosted Glass Chips */}
            {recent.length > 0 ? (
              <View style={styles.recentBlock}>
                <View style={[styles.recentHeader, styles.padH]}>
                  <Text style={styles.recentLabel}>Recent</Text>
                  <Pressable onPress={() => clearRecentSearches().then(setRecent)}>
                    <Text style={styles.clearAllText}>Clear</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.chipsScroll}
                >
                  {recent.map((term) => (
                    <View key={term} style={styles.recentChip}>
                      <Pressable onPress={() => setQuery(term)}>
                        <Text style={styles.recentChipText}>{term}</Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => removeRecentSearch(term).then(setRecent)}
                      >
                        <X size={13} color={palette.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Horizontal Liquid Glass World / Genre Filter Pills */}
            {!isSearchMode ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {MOBILE_EXPLORE_WORLDS.map((wId) => {
                  const def = WORLD_DEFINITIONS[wId];
                  const active = worldId === wId;
                  return (
                    <GlassPillButton
                      key={wId}
                      label={def.label}
                      size="sm"
                      variant={active ? "primary" : "secondary"}
                      active={active}
                      onPress={() => setWorldId(wId)}
                    />
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <GlassPosterGridSkeleton columns={3} posterWidth={posterWidth} rows={2} horizontalPadding={18} />
          ) : error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Connection Issue</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <GlassPillButton label="Retry" variant="primary" onPress={loadFirstPage} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Matches Found</Text>
              <Text style={styles.emptyText}>
                {isSearchMode
                  ? `Nothing matched "${query.trim()}". Try another keyword.`
                  : "No titles returned for this category."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cardCell}>
            <GlassPosterCard item={item} width={posterWidth} onPress={openItem} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  padH: {
    paddingHorizontal: 18,
  },
  headerBlock: {
    gap: 14,
    marginBottom: 16,
  },
  searchBarInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 2,
  },
  clearIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255, 244, 236, 0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  recentBlock: {
    gap: 8,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  clearAllText: {
    color: palette.accentBright,
    fontSize: 12.5,
    fontWeight: "700",
  },
  chipsScroll: {
    paddingHorizontal: 18,
    gap: 9,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(18, 25, 38, 0.72)",
    borderColor: palette.glassStroke,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  recentChipText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "600",
  },
  gridRow: {
    paddingHorizontal: 18,
    gap: 10,
  },
  cardCell: {
    marginBottom: 16,
  },
  emptyBox: {
    paddingVertical: 64,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },
});
