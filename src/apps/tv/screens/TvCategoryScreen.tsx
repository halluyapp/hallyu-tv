import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { prefetchPosterBatch } from "@/components/ui/Poster";
import { palette, spacing } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import {
  hydrateWorldFirstPage,
  loadWorldPage,
  peekWorldFirstPage,
  TV_CATEGORY_FILTERS,
  WORLD_DEFINITIONS,
  type SubFilterId,
  type WorldId,
} from "@/services/provider/categories";
import { prefetchDetail } from "@/services/provider/detailCache";
import type { CatalogueItem } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { GlassPosterGridSkeleton } from "@/ui/glass/GlassSkeleton";

type Nav = NativeStackNavigationProp<TvStackParamList>;

const LEFT_INSET = COLLAPSED_RAIL_WIDTH + 44;
const NUM_COLUMNS = 5;

interface TvCategoryScreenProps {
  worldId: WorldId;
}

/**
 * 1:1 Hallyu TV Category & Discover World (`docs/ui-previews/tv-02-sidebar-categories.png`):
 * - Bold world title + subtitle
 * - Horizontal row of Liquid Glass filter capsules ('All' pearl-glass active pill, 'Top Rated', 'Thriller'…)
 * - Virtualized 5-column cinema poster grid with infinite pagination & sequence protection
 */
export function TvCategoryScreen({ worldId }: TvCategoryScreenProps) {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const world = WORLD_DEFINITIONS[worldId];

  const [subFilter, setSubFilter] = useState<SubFilterId>("all");
  const [items, setItems] = useState<CatalogueItem[]>(() => peekWorldFirstPage(worldId) ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(() => (peekWorldFirstPage(worldId)?.length ?? 0) === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedPosterUri, setFocusedPosterUri] = useState<string | null>(
    () => peekWorldFirstPage(worldId)?.[0]?.posterUrl ?? null,
  );
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const reqSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSubFilter("all");
  }, [worldId]);

  const fetchFirstPage = useCallback(async () => {
    const seq = ++reqSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setLoading(true);

    if (subFilter === "all") {
      const cached = await hydrateWorldFirstPage(worldId);
      if (seq === reqSeqRef.current && cached && cached.length > 0) {
        setItems(cached);
        setFocusedPosterUri((prev) => prev ?? cached[0]?.posterUrl ?? null);
        setLoading(false);
        prefetchPosterBatch(cached.slice(0, 15).map((i) => i.posterUrl), "poster", 15);
      }
    }

    try {
      const res = await loadWorldPage(worldId, 1, subFilter, controller.signal);
      if (seq !== reqSeqRef.current || controller.signal.aborted) return;
      setItems(res.items);
      setPage(1);
      setTotalPages(res.totalPages);
      setFocusedPosterUri((prev) => prev ?? res.items[0]?.posterUrl ?? null);
      prefetchPosterBatch(res.items.slice(0, 15).map((i) => i.posterUrl), "poster", 15);
    } catch {
      if (seq !== reqSeqRef.current || controller.signal.aborted) return;
      setError("Could not load this category right now. Check your connection and retry.");
    } finally {
      if (seq === reqSeqRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [subFilter, worldId]);

  useEffect(() => {
    void fetchFirstPage();
    return () => {
      abortRef.current?.abort();
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [fetchFirstPage]);

  const fetchNextPage = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    const seq = reqSeqRef.current;
    setLoadingMore(true);
    try {
      const res = await loadWorldPage(worldId, nextPage, subFilter);
      if (seq !== reqSeqRef.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.subjectId));
        const extra = res.items.filter((i) => !seen.has(i.subjectId));
        return [...prev, ...extra];
      });
      setPage(nextPage);
      setTotalPages(res.totalPages);
    } catch {
      // Non-fatal pagination error
    } finally {
      if (seq === reqSeqRef.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, page, subFilter, totalPages, worldId]);

  const cardGap = 16;
  const availableWidth = Math.max(480, stage.width - LEFT_INSET - 36);
  const posterWidth = useMemo(
    () => Math.floor((availableWidth - cardGap * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [availableWidth],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      setLastClickedId(item.subjectId);
      prefetchDetail(item.slug);
      navigation.navigate("TvDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation],
  );

  const rowHeight = Math.round((posterWidth * 3) / 2) + 56;

  return (
    <View style={styles.root}>
      <AmbientArtworkCanvas imageUri={focusedPosterUri} intensity="medium" />

      <FlatList
        data={items}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.subjectId}
        showsVerticalScrollIndicator={false}
        windowSize={profile.listWindowSize}
        maxToRenderPerBatch={profile.maxToRenderPerBatch * 2}
        initialNumToRender={10}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: rowHeight,
          offset: rowHeight * Math.floor(index / NUM_COLUMNS),
          index,
        })}
        onEndReachedThreshold={0.5}
        onEndReached={fetchNextPage}
        contentContainerStyle={[styles.gridContent, { paddingLeft: LEFT_INSET }]}
        columnWrapperStyle={{ gap: cardGap }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.worldTitle}>{world.label}</Text>
            <Text style={styles.worldSubtitle}>{world.subtitle}</Text>
            <View style={styles.filterRow}>
              {TV_CATEGORY_FILTERS.map((filter, idx) => (
                <GlassPillButton
                  key={filter.id}
                  label={filter.label}
                  variant={subFilter === filter.id ? "pearl" : "secondary"}
                  active={subFilter === filter.id}
                  size="md"
                  hasTVPreferredFocus={idx === 0 && lastClickedId === null}
                  onPress={() => setSubFilter(filter.id)}
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <GlassPosterGridSkeleton columns={NUM_COLUMNS} posterWidth={posterWidth} rows={2} horizontalPadding={0} />
          ) : error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Connection Problem</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <GlassPillButton label="Retry" variant="primary" size="tv" onPress={fetchFirstPage} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Titles Match This Filter</Text>
              <Text style={styles.emptyText}>Try switching back to All to browse every title in {world.label}.</Text>
              <GlassPillButton label="Reset Filter" variant="pearl" size="tv" onPress={() => setSubFilter("all")} />
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
          <View style={styles.cell}>
            <GlassPosterCard
              item={item}
              width={posterWidth}
              hasTVPreferredFocus={lastClickedId === item.subjectId}
              onPress={openDetails}
              onFocusItem={(focused) => {
                prefetchDetail(focused.slug);
                if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
                focusTimerRef.current = setTimeout(() => {
                  if (focused.posterUrl) setFocusedPosterUri(focused.posterUrl);
                }, 320);
              }}
            />
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
  gridContent: {
    paddingTop: 26,
    paddingRight: 32,
    paddingBottom: 56,
  },
  header: {
    marginBottom: 22,
  },
  worldTitle: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
  },
  worldSubtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  cell: {
    marginBottom: 20,
  },
  emptyBox: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 420,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
