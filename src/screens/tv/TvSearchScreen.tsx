import { TvTile } from "@/components/tv/TvTile";
import { TvFocusable } from "@/components/tv/TvFocusable";
import { palette, radius, spacing, tvSafeArea, tvTypeScale } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { searchCatalogue, type SearchPage } from "@/services/provider/adapter";
import { ProviderError } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronLeft, Search as SearchIcon } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { initialsFor } from "@/components/ui/Poster";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEBOUNCE_MS = 450;
const COLUMNS = 4;

/**
 * TV search.
 *
 * A television has no touch keyboard, so the input is large, opens focused, and
 * the remote/IME does the typing. Results are a 4-column grid with large tiles.
 * Same request discipline as mobile: debounce, monotonic sequence guard, and an
 * explicit error state instead of pretending a network failure was "no results".
 */
export function TvSearchScreen() {
  const navigation = useNavigation<Nav>();
  const fx = effects();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      seqRef.current += 1;
      setPage(null);
      setLoading(false);
      setError(null);
      return;
    }
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await searchCatalogue(q, 1, controller.signal);
      if (seq !== seqRef.current) return;
      setPage(result);
    } catch (err) {
      if (seq !== seqRef.current || controller.signal.aborted) return;
      setError(err instanceof ProviderError ? err.message : "Search could not be completed.");
      setPage(null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TvFocusable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <ChevronLeft size={26} color={palette.textPrimary} />
        </TvFocusable>
        <View style={styles.inputWrap}>
          <SearchIcon size={22} color={palette.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => void run(query)}
            accessibilityLabel="Search field"
          />
        </View>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} /> : null}

      {error && !loading ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Search failed</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TvFocusable onPress={() => void run(query)} hasTVPreferredFocus accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryLabel}>Try again</Text>
          </TvFocusable>
        </View>
      ) : null}

      {!loading && !error && page && page.items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Nothing matched “{query.trim()}”</Text>
          <Text style={styles.emptyBody}>Try a shorter phrase or a different title.</Text>
        </View>
      ) : null}

      {!loading && !error && page && page.items.length > 0 ? (
        <FlatList
          data={page.items}
          key={`grid-${COLUMNS}`}
          numColumns={COLUMNS}
          keyExtractor={(item) => `${item.subjectId}_${item.slug}`}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: spacing.xl }}
          showsVerticalScrollIndicator={false}
          windowSize={fx.listWindow}
          initialNumToRender={12}
          maxToRenderPerBatch={fx.listBatch}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <TvTile
              title={item.name}
              posterUrl={item.posterUrl}
              initials={initialsFor(item.name)}
              meta={[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
              width={240}
              hasPreferredFocus={index === 0}
              onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
            />
          )}
        />
      ) : null}

      {!loading && !error && !page ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Search the catalogue</Text>
          <Text style={styles.emptyBody}>Type at least two characters.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: tvSafeArea.horizontal,
    paddingTop: tvSafeArea.vertical + spacing.lg,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.glassFill,
    borderWidth: 3,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnFocused: { borderColor: palette.cyan },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    height: 64,
  },
  input: { flex: 1, color: palette.textPrimary, fontSize: 22, paddingVertical: 0 },
  grid: { gap: spacing.xl, paddingHorizontal: tvSafeArea.horizontal, paddingBottom: spacing.huge },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.huge, gap: spacing.md },
  errorTitle: { ...tvTypeScale.title, color: palette.textPrimary },
  errorBody: { ...tvTypeScale.body, color: palette.textSecondary, textAlign: "center", maxWidth: 700 },
  emptyTitle: { ...tvTypeScale.title, color: palette.textPrimary },
  emptyBody: { ...tvTypeScale.body, color: palette.textSecondary },
  retryBtn: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  retryLabel: { ...tvTypeScale.body, color: palette.textPrimary, fontWeight: "700" },
});
