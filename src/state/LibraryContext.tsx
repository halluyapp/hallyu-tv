import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";

/**
 * Watchlist + Continue Watching (watch progress), synced through Supabase with
 * RLS. Only authenticated users have library state; guests always see empty.
 */

export interface LibraryTitle {
  subject_id: string;
  detail_path: string | null;
  media_type: "movie" | "series";
  title: string;
  poster_url: string | null;
}

export interface ProgressRow extends LibraryTitle {
  season_number: number | null;
  episode_number: number | null;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}

interface LibraryContextType {
  watchlist: LibraryTitle[];
  progress: ProgressRow[];
  inWatchlist: (subjectId: string) => boolean;
  resumeFor: (subjectId: string, season?: number | null, episode?: number | null) => ProgressRow | null;
  toggleWatchlist: (item: LibraryTitle) => Promise<void>;
  saveProgress: (row: Omit<ProgressRow, "updated_at">) => Promise<void>;
  clearProgress: (subjectId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const LibraryContext = createContext<LibraryContextType | null>(null);

/** Playback below this share of duration is resumable; beyond it counts as completed. */
export const COMPLETION_THRESHOLD = 0.95;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<LibraryTitle[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setWatchlist([]);
      setProgress([]);
      return;
    }
    setLoading(true);
    const [wl, wp] = await Promise.all([
      supabase.from("watchlist").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("watch_progress").select("*").order("updated_at", { ascending: false }).limit(100),
    ]);
    if (wl.error) console.error("watchlist fetch failed:", wl.error.message);
    if (wp.error) console.error("progress fetch failed:", wp.error.message);
    setWatchlist((wl.data as LibraryTitle[] | null) ?? []);
    setProgress((wp.data as ProgressRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const inWatchlist = useCallback(
    (subjectId: string) => watchlist.some((w) => w.subject_id === subjectId),
    [watchlist],
  );

  const resumeFor = useCallback(
    (subjectId: string, season: number | null = null, episode: number | null = null) => {
      return (
        progress.find(
          (p) => p.subject_id === subjectId && p.season_number === season && p.episode_number === episode,
        ) ?? null
      );
    },
    [progress],
  );

  const toggleWatchlist = useCallback(
    async (item: LibraryTitle) => {
      if (!user) return;
      const exists = inWatchlist(item.subject_id);
      if (exists) {
        setWatchlist((prev) => prev.filter((w) => w.subject_id !== item.subject_id));
        const { error } = await supabase.from("watchlist").delete().eq("subject_id", item.subject_id);
        if (error) {
          console.error("watchlist delete failed:", error.message);
          void refresh();
        }
      } else {
        setWatchlist((prev) => [item, ...prev]);
        const { error } = await supabase.from("watchlist").insert({
          subject_id: item.subject_id,
          detail_path: item.detail_path,
          media_type: item.media_type,
          title: item.title,
          poster_url: item.poster_url,
        });
        if (error) {
          console.error("watchlist insert failed:", error.message);
          void refresh();
        }
      }
    },
    [user, inWatchlist, refresh],
  );

  const saveProgress = useCallback(
    async (row: Omit<ProgressRow, "updated_at">) => {
      if (!user) return;
      // Optimistic local-first write, then sync.
      setProgress((prev) => {
        const rest = prev.filter(
          (p) =>
            !(
              p.subject_id === row.subject_id &&
              p.season_number === row.season_number &&
              p.episode_number === row.episode_number
            ),
        );
        return [{ ...row, updated_at: new Date().toISOString() }, ...rest];
      });
      const { error } = await supabase.from("watch_progress").upsert(
        {
          ...row,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, subject_id, season_number, episode_number" },
      );
      if (error) console.error("progress upsert failed:", error.message);
    },
    [user],
  );

  const clearProgress = useCallback(
    async (subjectId: string) => {
      if (!user) return;
      setProgress((prev) => prev.filter((p) => p.subject_id !== subjectId));
      const { error } = await supabase.from("watch_progress").delete().eq("subject_id", subjectId);
      if (error) console.error("progress delete failed:", error.message);
    },
    [user],
  );

  return (
    <LibraryContext.Provider
      value={{ watchlist, progress, inWatchlist, resumeFor, toggleWatchlist, saveProgress, clearProgress, refresh, loading }}
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
