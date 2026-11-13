import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hydrateCatalogue, loadCatalogue, type CatalogueSnapshot } from "@/services/catalogue";
import { ProviderError } from "@/types/provider";

const CATALOGUE_FRESH_TTL_MS = 5 * 60_000;

interface CatalogueContextValue {
  snapshot: CatalogueSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CatalogueContext = createContext<CatalogueContextValue | null>(null);

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<CatalogueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedAtRef = useRef<number>(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh && loadedAtRef.current > 0 && Date.now() - loadedAtRef.current < CATALOGUE_FRESH_TTL_MS) {
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (!isRefresh) {
        const cached = await hydrateCatalogue();
        if (cached) {
          setSnapshot(cached);
          setLoading(false);
          if (Date.now() - cached.at < CATALOGUE_FRESH_TTL_MS) {
            loadedAtRef.current = cached.at;
            return;
          }
        }
      }
      const fresh = await loadCatalogue(isRefresh);
      loadedAtRef.current = Date.now();
      setSnapshot(fresh);
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Could not load the catalogue right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  const value = useMemo(
    () => ({ snapshot, loading, refreshing, error, refresh }),
    [snapshot, loading, refreshing, error, refresh],
  );

  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>;
}

export function useSharedCatalogue(): CatalogueContextValue {
  const ctx = useContext(CatalogueContext);
  if (!ctx) {
    throw new Error("useSharedCatalogue must be used inside CatalogueProvider");
  }
  return ctx;
}
