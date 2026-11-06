import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search, X } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { COLLAPSED_RAIL_WIDTH } from "@/apps/tv/focus/TvSidebar";
import type { TvStackParamList } from "@/apps/tv/navigation/tvTypes";
import { palette, radius } from "@/design-system/tokens";
import { usePerformanceProfile } from "@/hooks/useDeviceTier";
import { useStage } from "@/hooks/useStage";
import { searchCatalogue } from "@/services/provider/adapter";
import { prefetchDetail } from "@/services/provider/detailCache";
import { hydrateHome, loadHome } from "@/services/provider/homeCatalogue";
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
} from "@/services/searchHistory";
import { useSound } from "@/services/sound/SoundContext";
import type { CatalogueItem } from "@/types/provider";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { GlassPosterCard } from "@/ui/glass/GlassPosterCard";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

type Nav = NativeStackNavigationProp<TvStackParamList>;

const LEFT_INSET = COLLAPSED_RAIL_WIDTH + 38;
const KEY_ROWS: string[][] = [
  ["A", "B", "C", "D", "E", "F"],
  ["G", "H", "I", "J", "K", "L"],
  ["M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X"],
  ["Y", "Z", "0", "1", "2", "3"],
  ["4", "5", "6", "7", "8", "9"],
];

type TypeFilter = "all" | "series" | "movie";

/**
 * 1:1 Hallyu TV Search Screen (`docs/ui-previews/tv-04-search.png`):
 * - Left pane: Floating Frosted Liquid Glass 6x6 Remote Keyboard Panel with
 *   jewel-like translucent keycap tiles, luminous coral-pearl focus glow,
 *   SPACE / DEL / CLEAR glass pills, and Recent Searches frosted glass chips.
 * - Right pane: All / Series / Movies Liquid Glass filter pills + live 4-column
 *   debounced, sequence-protected poster grid.
 */
export function TvSearchScreen() {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const profile = usePerformanceProfile();
  const { play } = useSound();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [results, setResults] = useState<CatalogueItem[]>([]);
  const [trendingFallback, setTrendingFallback] = useState<CatalogueItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambientUri, setAmbientUri] = useState<string | null>(null);

  const searchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadRecentSearches().then(setRecent).catch(() => {});
    hydrateHome()
      .then((cached) => cached ?? loadHome().catch(() => []))
      .then((sections) => {
        const items = sections.flatMap((s) => s.items).slice(0, 16);
        setTrendingFallback(items);
        if (items[0]?.posterUrl) setAmbientUri(items[0].posterUrl);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const seq = ++searchSeqRef.current;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      searchCatalogue(trimmed, 1, controller.signal)
        .then((res) => {
          if (seq !== searchSeqRef.current || controller.signal.aborted) return;
          setResults(res.items);
          if (res.items[0]?.posterUrl) setAmbientUri(res.items[0].posterUrl);
          if (trimmed.length >= 3 && res.items.length > 0) {
            addRecentSearch(trimmed).then(setRecent).catch(() => {});
          }
        })
        .catch(() => {
          if (seq !== searchSeqRef.current || controller.signal.aborted) return;
          setError("Search request failed. Check your connection and try again.");
        })
        .finally(() => {
          if (seq === searchSeqRef.current && !controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 280);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const appendChar = useCallback(
    (ch: string) => {
      play("tap");
      setQuery((prev) => (prev.length < 48 ? prev + ch.toLowerCase() : prev));
    },
    [play],
  );

  const backspace = useCallback(() => {
    play("tap");
    setQuery((prev) => prev.slice(0, -1));
  }, [play]);

  const clearQuery = useCallback(() => {
    play("tap");
    setQuery("");
  }, [play]);

  const displayedItems = useMemo(() => {
    const base = query.trim().length >= 2 ? results : trendingFallback;
    if (typeFilter === "all") return base;
    return base.filter((item) => item.mediaType === typeFilter);
  }, [query, results, trendingFallback, typeFilter]);

  const keyboardWidth = Math.min(340, Math.max(288, Math.round(stage.width * 0.31)));
  const rightWidth = Math.max(360, stage.width - LEFT_INSET - keyboardWidth - 48);
  const cols = rightWidth >= 620 ? 4 : 3;
  const gap = 14;
  const posterWidth = Math.floor((rightWidth - gap * (cols - 1)) / cols);

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      if (query.trim().length >= 2) {
        addRecentSearch(query.trim()).then(setRecent).catch(() => {});
      }
      navigation.navigate("TvDetails", {
        subjectId: item.subjectId,
        detailPath: item.slug,
        title: item.name,
        posterUrl: item.posterUrl,
      });
    },
    [navigation, query],
  );

  return (
    <View style={[styles.root, { paddingLeft: LEFT_INSET }]}>
      <AmbientArtworkCanvas imageUri={ambientUri} intensity="medium" />

      {/* Left Pane: Sculpted Liquid Glass Keyboard + Recent Chips */}
      <View style={[styles.leftCol, { width: keyboardWidth }]}>
        <LiquidGlassView
          variant="dock"
          borderRadius={26}
          blurIntensity={42}
          contentStyle={styles.keyboardPanel}
        >
          {/* Frosted glass search input capsule */}
          <View style={styles.inputCapsule}>
            <Search size={16} color={palette.textSecondary} />
            <Text numberOfLines={1} style={[styles.inputValue, !query && styles.inputPlaceholder]}>
              {query ? `${query}|` : "Search dramas, movies, anime…"}
            </Text>
            {query.length > 0 ? (
              <Pressable
                focusable
                accessible
                accessibilityLabel="Clear query"
                onPress={clearQuery}
                style={styles.inlineClear}
              >
                <X size={14} color={palette.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {/* 6x6 Jewel Liquid Glass Keycaps */}
          <View style={styles.keyGrid}>
            {KEY_ROWS.map((row, rIdx) => (
              <View key={`row-${rIdx}`} style={styles.keyRow}>
                {row.map((ch, cIdx) => (
                  <TvKeyCap
                    key={ch}
                    label={ch}
                    hasTVPreferredFocus={rIdx === 0 && cIdx === 0}
                    onSelectKey={appendChar}
                  />
                ))}
              </View>
            ))}
          </View>

          {/* SPACE / DEL / CLEAR Liquid Glass Utility Capsules */}
          <View style={styles.utilityRow}>
            <TvUtilityKey label="SPACE" onPress={() => appendChar(" ")} />
            <TvUtilityKey label="DEL" onPress={backspace} />
            <TvUtilityKey label="CLEAR" onPress={clearQuery} />
          </View>
        </LiquidGlassView>

        {/* Recent Searches Frosted Glass Chips */}
        {recent.length > 0 ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>Recent</Text>
              <Pressable focusable onPress={() => clearRecentSearches().then(setRecent)}>
                <Text style={styles.clearHistoryText}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.recentChips}>
              {recent.slice(0, 4).map((term) => (
                <GlassPillButton
                  key={term}
                  label={term}
                  size="sm"
                  variant="secondary"
                  onPress={() => setQuery(term)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Right Pane: Filter Pills + Live Poster Grid */}
      <View style={styles.rightCol}>
        <View style={styles.resultsTopBar}>
          <Text numberOfLines={1} style={styles.resultsHeading}>
            {query.trim().length >= 2 ? `RESULTS FOR:  ${query.trim()}` : "POPULAR SEARCHES"}
          </Text>
          {loading ? <ActivityIndicator size="small" color={palette.accent} /> : null}
        </View>

        <View style={styles.filterPillsRow}>
          <GlassPillButton
            label="All"
            size="sm"
            variant={typeFilter === "all" ? "pearl" : "secondary"}
            active={typeFilter === "all"}
            onPress={() => setTypeFilter("all")}
          />
          <GlassPillButton
            label="Series"
            size="sm"
            variant={typeFilter === "series" ? "pearl" : "secondary"}
            active={typeFilter === "series"}
            onPress={() => setTypeFilter("series")}
          />
          <GlassPillButton
            label="Movies"
            size="sm"
            variant={typeFilter === "movie" ? "pearl" : "secondary"}
            active={typeFilter === "movie"}
            onPress={() => setTypeFilter("movie")}
          />
        </View>

        <FlatList
          key={`cols-${cols}`}
          data={displayedItems}
          numColumns={cols}
          keyExtractor={(item) => item.subjectId}
          showsVerticalScrollIndicator={false}
          windowSize={profile.listWindowSize}
          maxToRenderPerBatch={profile.maxToRenderPerBatch * 2}
          initialNumToRender={8}
          removeClippedSubviews
          columnWrapperStyle={{ gap }}
          contentContainerStyle={styles.resultsGrid}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>
                  {error ? "Search Unavailable" : `No matches for "${query.trim()}"`}
                </Text>
                <Text style={styles.emptySub}>
                  {error ?? "Try another title keyword or switch the media filter to All."}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: 18 }}>
              <GlassPosterCard
                item={item}
                width={posterWidth}
                onPress={openDetails}
                onFocusItem={(focused) => {
                  prefetchDetail(focused.slug);
                  if (focused.posterUrl) setAmbientUri(focused.posterUrl);
                }}
              />
            </View>
          )}
        />
      </View>
    </View>
  );
}

const TvKeyCap = memo(function TvKeyCap({
  label,
  hasTVPreferredFocus,
  onSelectKey,
}: {
  label: string;
  hasTVPreferredFocus?: boolean;
  onSelectKey: (ch: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      focusable
      accessible
      accessibilityRole="keyboardkey"
      accessibilityLabel={label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => onSelectKey(label)}
      style={styles.keyWrap}
    >
      <LiquidGlassView
        variant={focused ? "ember" : "card"}
        borderRadius={12}
        focused={focused}
        contentStyle={styles.keyInner}
      >
        <Text style={[styles.keyText, focused && styles.keyTextFocused]}>{label}</Text>
      </LiquidGlassView>
    </Pressable>
  );
});

const TvUtilityKey = memo(function TvUtilityKey({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      focusable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <LiquidGlassView
        variant={focused ? "pearl" : "card"}
        borderRadius={radius.pill}
        focused={focused}
        contentStyle={styles.utilityKeyInner}
      >
        <Text style={[styles.utilityKeyText, focused && { color: palette.pearlInk }]}>{label}</Text>
      </LiquidGlassView>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.background,
    paddingTop: 22,
    paddingRight: 28,
    gap: 24,
  },
  leftCol: {
    gap: 14,
  },
  keyboardPanel: {
    padding: 14,
    gap: 10,
  },
  inputCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10, 14, 22, 0.72)",
    borderColor: palette.glassStrokeBright,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputValue: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  inputPlaceholder: {
    color: palette.textMuted,
    fontWeight: "500",
    fontSize: 13.5,
  },
  inlineClear: {
    padding: 2,
  },
  keyGrid: {
    gap: 6,
  },
  keyRow: {
    flexDirection: "row",
    gap: 6,
  },
  keyWrap: {
    flex: 1,
  },
  keyInner: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },
  keyTextFocused: {
    color: palette.pearlInk,
    fontWeight: "800",
  },
  utilityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  utilityKeyInner: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityKeyText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  recentSection: {
    gap: 8,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  recentLabel: {
    color: palette.textMuted,
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  clearHistoryText: {
    color: palette.accentBright,
    fontSize: 12,
    fontWeight: "700",
  },
  recentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rightCol: {
    flex: 1,
  },
  resultsTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  resultsHeading: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  filterPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  resultsGrid: {
    paddingBottom: 44,
  },
  emptyWrap: {
    paddingVertical: 56,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  emptySub: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
    maxWidth: 380,
  },
});
