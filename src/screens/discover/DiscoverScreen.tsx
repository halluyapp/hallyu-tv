import { PosterCard } from "@/components/ui/PosterCard";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { fetchHome, searchCatalogue } from "@/services/provider/adapter";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search as SearchIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "@/navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Discover: genre/category browsing plus the search entry point. */
export function DiscoverScreen() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogueItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, loadingMore: false });
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchHome()
      .then(setSections)
      .catch((err) => setError(err instanceof ProviderError ? err.message : "Could not load categories."));
  }, []);

  // Debounced search (300 ms) with stale-response protection.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const page = await searchCatalogue(q);
        if (!stale) {
          setResults(page.items);
          setPagination({ page: page.page, totalPages: page.totalPages, loadingMore: false });
        }
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  const queryRef = useRef(query);
  queryRef.current = query;
  const loadMore = useCallback(async () => {
    const q = query.trim();
    if (!results || pagination.loadingMore || pagination.page >= pagination.totalPages) return;
    setPagination((p) => ({ ...p, loadingMore: true }));
    try {
      const next = await searchCatalogue(q, pagination.page + 1);
      if (queryRef.current.trim() !== q) return;
      setResults((prev) => {
        const seen = new Set((prev ?? []).map((i) => i.subjectId));
        return [...(prev ?? []), ...next.items.filter((i) => !seen.has(i.subjectId))];
      });
      setPagination((p) => ({ ...p, page: next.page, totalPages: next.totalPages, loadingMore: false }));
    } catch {
      if (queryRef.current.trim() === q) setPagination((p) => ({ ...p, loadingMore: false }));
    }
  }, [query, results, pagination]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return (sections ?? [])
      .filter((s) => s.section !== "Banner")
      .flatMap((s) => s.items)
      .filter((i) => {
        if (!i.genre) return false;
        const g = i.genre.split(",")[0]!.trim();
        if (seen.has(g)) return false;
        seen.add(g);
        return true;
      })
      .slice(0, 18)
      .map((i) => i.genre!.split(",")[0]!.trim());
  }, [sections]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Discover</Text>
      <View style={styles.searchWrap}>
        <SearchIcon size={18} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search films and series"
          placeholderTextColor={palette.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {results !== null ? (
        searching ? (
          <SkeletonRail />
        ) : results.length === 0 ? (
          <EmptyState title="No matches" message={`Nothing found for “${query}”. Try a different search.`} />
        ) : (
          <FlatList
            data={results}
            numColumns={3}
            keyExtractor={(i) => i.subjectId}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.6}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
            renderItem={({ item }) => (
              <PosterCard item={item} width={(width - spacing.xl * 2 - spacing.md * 2) / 3} onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })} />
            )}
          />
        )
      ) : error ? (
        <ErrorState message={error} />
      ) : sections === null ? (
        <SkeletonRail />
      ) : (
        <FlatList
          data={categories}
          numColumns={3}
          keyExtractor={(c) => c}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => <CategoryTile label={item} onPress={() => setQuery(item)} />}
        />
      )}
    </View>
  );
}

/** Deterministic per-genre duotone so each "world" keeps its own light. */
const TILE_TINTS: [string, string][] = [
  ["#F07855", "rgba(101,56,47,0.55)"],
  ["#68B68D", "rgba(31,58,46,0.55)"],
  ["#E5B35E", "rgba(74,58,34,0.55)"],
  ["#E06B70", "rgba(67,40,42,0.55)"],
  ["#7E8CE0", "rgba(42,46,67,0.55)"],
  ["#E08CC4", "rgba(64,42,58,0.55)"],
];

function tintFor(label: string): [string, string] {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return TILE_TINTS[h % TILE_TINTS.length]!;
}

function CategoryTile({ label, onPress }: { label: string; onPress: () => void }) {
  const [glow, deep] = tintFor(label);
  return (
    <Pressable style={styles.category} onPress={onPress}>
      <LinearGradient
        colors={[glow, deep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.categoryGlow}
      />
      <Text style={styles.categoryLabel}>{label}</Text>
      <Text style={styles.categoryHint}>Browse</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  title: { ...typeScale.title, color: palette.textPrimary, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    height: 44,
  },
  searchInput: { flex: 1, color: palette.textPrimary, fontSize: 15 },
  category: {
    flex: 1 / 3,
    flexGrow: 1,
    overflow: "hidden",
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    margin: spacing.xs,
    gap: 2,
  },
  categoryGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.34 },
  categoryLabel: { color: palette.textPrimary, fontWeight: "700", fontSize: 14 },
  categoryHint: { color: "rgba(244,242,237,0.66)", fontSize: 11 },
});
