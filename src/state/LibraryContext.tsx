import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

export type { LibraryTitle, ProgressRow } from "@/types/library";
export { COMPLETION_THRESHOLD } from "@/types/library";

/**
 * Watchlist + Continue Watching, stored only on this device. TV and mobile
 * each keep an independent local library; no account or sync backend exists.
 */

interface LibraryContextType {
  watchlist: LibraryTitle[];
  progress: ProgressRow[];
  inWatchlist: (subjectId: string) => boolean;
  resumeFor: (subjectId: string, season?: number | null, episode?: number | null) => ProgressRow | null;
  latestFor: (subjectId: string) => ProgressRow | null;
  toggleWatchlist: (item: LibraryTitle) => Promise<void>;
  saveProgress: (row: Omit<ProgressRow, "updated_at">) => Promise<void>;
  clearProgress: (subjectId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const LibraryContext = createContext<LibraryContextType | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(emptyLibrary);
  const [loading, setLoading] = useState(true);
  const snapshotRef = useRef(snapshot);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    const next = await loadLibrary();
    snapshotRef.current = next;
    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commit = useCallback((update: (prev: LibrarySnapshot) => LibrarySnapshot) => {
    const next = update(snapshotRef.current);
    snapshotRef.current = next;
    setSnapshot(next);
    // Serialize writes so rapid progress updates cannot land out of order.
    writeQueue.current = writeQueue.current
      .then(() => saveLibrary(next))
      .catch((err) => console.error("local library save failed:", err));
    return writeQueue.current;
  }, []);

  const inWatchlist = useCallback(
    (subjectId: string) => snapshot.watchlist.some((w) => w.subject_id === subjectId),
    [snapshot.watchlist],
  );

  const resumeFor = useCallback(
    (subjectId: string, season: number | null = null, episode: number | null = null) =>
      snapshot.progress.find(
        (p) => p.subject_id === subjectId && p.season_number === season && p.episode_number === episode,
      ) ?? null,
    [snapshot.progress],
  );

  const latestFor = useCallback(
    (subjectId: string) => latestProgressFor(snapshot.progress, subjectId),
    [snapshot.progress],
  );

  const toggleWatchlist = useCallback(
    (item: LibraryTitle) => commit((prev) => toggleWatchlistItem(prev, item)),
    [commit],
  );

  const saveProgress = useCallback(
    (row: Omit<ProgressRow, "updated_at">) =>
      commit((prev) => upsertProgress(prev, { ...row, updated_at: new Date().toISOString() })),
    [commit],
  );

  const clearProgress = useCallback(
    (subjectId: string) => commit((prev) => clearProgressForSubject(prev, subjectId)),
    [commit],
  );

  return (
    <LibraryContext.Provider
      value={{
        watchlist: snapshot.watchlist,
        progress: snapshot.progress,
        inWatchlist,
        resumeFor,
        latestFor,
        toggleWatchlist,
        saveProgress,
        clearProgress,
        refresh,
        loading,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
