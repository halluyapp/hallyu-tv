import { Poster, initialsFor } from "@/components/ui/Poster";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { searchCatalogue, type SearchPage } from "@/services/provider/adapter";
import { clearRecentSearches, loadRecentSearches, pushRecentSearch } from "@/services/search/recent";
import { ProviderError } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronLeft, Search as SearchIcon, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;
const COLUMNS = 3;

/**
 * Search — a first-class destination.
 *
 * Request discipline (the brief's §3.5 list, all implemented):
 *  - 350 ms debounce so a request is not fired per keystroke.
 *  - A monotonically increasing request id: a slower earlier response can never
 *    overwrite the results of a newer query.
 *  - AbortController cancels the HTTP request itself on a new query or unmount.
 *  - Search results are never cached by the provider layer (they must be fresh).
 *  - Pagination appends without duplicating items.
 */
export function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fx = effects();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const seqRef = useRef(0);
  // Mirrors `recent` so a search never depends on the latest recent-list state.
  // Reading it from state made `run` change identity after every search, which
  // re-armed the debounce effect and fired a duplicate request 350 ms later.
  const recentRef = useRef<string[]>([]);
  // The last query actually sent, so the debounce cannot re-send a query that was
  // just submitted directly (chip tap / keyboard search).
  const lastRequestRef = useRef({ query: "", at: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);

  const applyRecent = useCallback((next: string[]) => {
    recentRef.current = next;
    setRecent(next);
  }, []);

  useEffect(() => {
    void loadRecentSearches().then(applyRecent);
    return () => abortRef.current?.abort();
  }, [applyRecent]);

  const run = useCallback(async (raw: string, page = 1) => {
    const q = raw.trim();
    if (q.length < MIN_QUERY) {
      abortRef.current?.abort();
      seqRef.current += 1;
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (page === 1) {
      lastRequestRef.current = { query: q, at: Date.now() };
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const pageData = await searchCatalogue(q, page, controller.signal);
      // Stale guard: only the newest request may write results.
      if (seq !== seqRef.current) return;
      setResults((prev) =>
        page === 1 || !prev
          ? pageData
          : {
              ...pageData,
              items: [...prev.items, ...pageData.items.filter((i) => !prev.items.some((p) => p.subjectId === i.subjectId))],
            },
      );
      if (page === 1) void pushRecentSearch(q, recentRef.current).then(applyRecent);
    } catch (err) {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setError(err instanceof ProviderError ? err.message : "Search could not be completed. Check your connection.");
      if (page === 1) setResults(null);
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [applyRecent]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim();
      const last = lastRequestRef.current;
      // A chip tap or the keyboard's search key already dispatched this exact
      // query a moment ago; re-sending it would be a duplicate network round trip.
      if (q === last.query && Date.now() - last.at < 1200) return;
      void run(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, run]);

  const loadMore = useCallback(() => {
    if (!results || loading || loadingMore) return;
    if (results.page >= results.totalPages) return;
    void run(query, results.page + 1);
  }, [results, loading, loadingMore, query, run]);

  const retry = useCallback(() => void run(query), [run, query]);

  const tileWidth = Math.floor((width - spacing.xl * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={20} color={palette.textPrimary} />
        </Pressable>
        <View style={styles.inputWrap}>
          <SearchIcon size={17} color={palette.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search films, series, anime…"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={() => void run(query)}
            accessibilityLabel="Search field"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={16} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {query.trim().length < MIN_QUERY ? (
        <View style={{ paddingHorizontal: spacing.xl }}>
          {recent.length > 0 ? (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.sectionLabel}>Recent searches</Text>
                <Pressable
                  onPress={() => {
                    void clearRecentSearches();
                    applyRecent([]);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.clearLabel}>Clear</Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recent.map((term) => (
                  <Pressable
                    key={term}
                    style={styles.chip}
                    onPress={() => {
                      setQuery(term);
                      void run(term);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipLabel}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <EmptyState title="Search the catalogue" message="Type at least two characters to find a film, series or anime." />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading && !results ? (
        <View style={{ marginTop: spacing.xl }}>
          <SkeletonRail count={3} />
        </View>
      ) : results && results.items.length === 0 ? (
        <EmptyState title="No matches" message={`Nothing found for “${query.trim()}”. Try a different title or a shorter phrase.`} />
      ) : results ? (
        <FlatList
          data={results.items}
          numColumns={COLUMNS}
          keyExtractor={(i) => i.subjectId}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          windowSize={fx.listWindow + 2}
          initialNumToRender={fx.listInitial + 3}
          maxToRenderPerBatch={fx.listBatch}
          removeClippedSubviews
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={palette.accent} /> : null}
          renderItem={({ item }) => (
            <Pressable
              style={{ width: tileWidth }}
              onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.mediaType === "series" ? "series" : "movie"}`}
            >
              <Poster
                uri={item.posterUrl}
                style={{ width: tileWidth, height: Math.round((tileWidth * 3) / 2) }}
                initials={initialsFor(item.name)}
                fallbackLabel={item.name}
              />
              <Text numberOfLines={2} style={styles.tileTitle}>
                {item.name}
              </Text>
              <Text style={styles.tileMeta}>{[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}</Text>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 46,
  },
  input: { flex: 1, color: palette.textPrimary, fontSize: 15, paddingVertical: 0 },
  recentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.sm },
  sectionLabel: { ...typeScale.micro, color: palette.textSecondary },
  clearLabel: { ...typeScale.caption, color: palette.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  chipLabel: { color: palette.textPrimary, fontSize: 13, fontWeight: "600" },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", marginTop: spacing.sm },
  tileMeta: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
});
