import type { CatalogueItem, HomeSection } from "@/types/provider";

/**
 * Discovery derived from real catalogue data — no invented curation.
 *
 * Categories come from the genres the provider actually returns; a mood maps to
 * a genre that exists in the catalogue (and is dropped when it does not), so a
 * chip never produces an empty search for a genre nobody tagged.
 */

export interface GenreSummary {
  label: string;
  count: number;
}

/** Genres present in the catalogue, most common first. */
export function genresFromSections(sections: HomeSection[], limit = 18): GenreSummary[] {
  const counts = new Map<string, number>();
  for (const section of sections) {
    if (section.section === "Banner") continue;
    for (const item of section.items) {
      for (const raw of splitGenres(item.genre)) {
        counts.set(raw, (counts.get(raw) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function splitGenres(genre: string | null | undefined): string[] {
  if (!genre) return [];
  return genre
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && g.length < 24);
}

/** A mood is only offered when its genre actually exists in the catalogue. */
export const MOODS: { label: string; genre: string }[] = [
  { label: "Mind-bending", genre: "Sci-Fi" },
  { label: "Feel-good", genre: "Comedy" },
  { label: "Late night", genre: "Thriller" },
  { label: "Family night", genre: "Family" },
  { label: "Adrenaline", genre: "Action" },
  { label: "Slow burn", genre: "Drama" },
];

export function availableMoods(genres: GenreSummary[]): { label: string; genre: string }[] {
  const present = new Set(genres.map((g) => g.label.toLowerCase()));
  return MOODS.filter((m) => present.has(m.genre.toLowerCase()));
}

/** Deterministic accent per genre so tiles are visually distinguishable. */
export function tintForGenre(label: string): "blue" | "cyan" {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return h % 3 === 0 ? "cyan" : "blue";
}

/** Top-rated titles from real ratings only (never fabricated). */
export function topRated(items: CatalogueItem[], limit = 20): CatalogueItem[] {
  return items
    .filter((i) => i.rating != null && Number.parseFloat(i.rating) > 0)
    .sort((a, b) => Number.parseFloat(b.rating!) - Number.parseFloat(a.rating!))
    .slice(0, limit);
}
