import { useCallback, useEffect, useRef, useState } from "react";
import { hydrateCatalogue, loadCatalogue, type CatalogueSnapshot } from "@/services/catalogue";
import { ProviderError } from "@/types/provider";

export interface CatalogueState {
  snapshot: CatalogueSnapshot | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Load the shared catalogue once per screen.
 *
 * The last known snapshot paints immediately (memory, then disk) and the live
 * fetch revalidates it. A failed refresh keeps the cached wall instead of
 * replacing it with an error.
 */
export function useCatalogue(): CatalogueState {
  const [snapshot, setSnapshot] = useState<CatalogueSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const live = await loadCatalogue();
      if (mounted.current) setSnapshot(live);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof ProviderError ? err.message : "Could not reach the catalogue. Check your connection.");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hydrateCatalogue().then((cached) => {
      if (!cancelled && cached) setSnapshot(cached);
    });
    void load(false);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { snapshot, loading, error, refreshing, refresh: useCallback(() => load(true), [load]) };
}
