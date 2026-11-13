import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clearProgressForSubject,
  emptyLibrary,
  latestProgressFor,
  loadLibrary,
  saveLibrary,
  toggleWatchlistItem,
  upsertProgress,
  type LibrarySnapshot,
} from "@/services/localLibrary";
import type { LibraryTitle, ProgressRow } from "@/types/library";

interface LibraryContextValue {
  watchlist: LibraryTitle[];
  progress: ProgressRow[];
  loading: boolean;
  inWatchlist: (subjectId: string) => boolean;
  toggleWatchlist: (item: LibraryTitle) => Promise<void>;
  resumeFor: (subjectId: string, season: number | null, episode: number | null) => ProgressRow | null;
  latestFor: (subjectId: string) => ProgressRow | null;
  saveProgress: (row: Omit<ProgressRow, "updated_at">) => Promise<void>;
  clearProgress: (subjectId: string) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(emptyLibrary);
  const [loading, setLoading] = useState(true);
  const snapshotRef = useRef<LibrarySnapshot>(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    let active = true;
    void loadLibrary().then((loaded) => {
      if (!active) return;
      snapshotRef.current = loaded;
      setSnapshot(loaded);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback(async (next: LibrarySnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    await saveLibrary(next);
  }, []);

  const inWatchlist = useCallback(
    (subjectId: string) => snapshot.watchlist.some((item) => item.subject_id === subjectId),
    [snapshot.watchlist],
  );

  const toggleWatchlist = useCallback(
    async (item: LibraryTitle) => {
      const next = toggleWatchlistItem(snapshotRef.current, item);
      await commit(next);
    },
    [commit],
  );

  const resumeFor = useCallback(
    (subjectId: string, season: number | null, episode: number | null) => {
      return (
        snapshot.progress.find(
          (row) =>
            row.subject_id === subjectId &&
            (row.season_number ?? null) === season &&
            (row.episode_number ?? null) === episode,
        ) ?? null
      );
    },
    [snapshot.progress],
  );

  const latestFor = useCallback(
    (subjectId: string) => latestProgressFor(snapshot.progress, subjectId),
    [snapshot.progress],
  );

  const saveProgress = useCallback(
    async (row: Omit<ProgressRow, "updated_at">) => {
      const full: ProgressRow = {
        ...row,
        updated_at: new Date().toISOString(),
      };
      const next = upsertProgress(snapshotRef.current, full);
      await commit(next);
    },
    [commit],
  );

  const clearProgress = useCallback(
    async (subjectId: string) => {
      const next = clearProgressForSubject(snapshotRef.current, subjectId);
      await commit(next);
    },
    [commit],
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      watchlist: snapshot.watchlist,
      progress: snapshot.progress,
      loading,
      inWatchlist,
      toggleWatchlist,
      resumeFor,
      latestFor,
      saveProgress,
      clearProgress,
    }),
    [snapshot.watchlist, snapshot.progress, loading, inWatchlist, toggleWatchlist, resumeFor, latestFor, saveProgress, clearProgress],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }
  return ctx;
}
