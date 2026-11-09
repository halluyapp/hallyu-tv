import { searchCatalogue } from "@/services/provider/adapter";
import type { CatalogueItem } from "@/types/provider";
import { isAnimeItem, isChinese, isKorean, uniqueItems } from "./worlds";

/**
 * Country/​world harvesting.
 *
 * The provider exposes no country or genre endpoint, but `/search` results carry
 * verified `country`, `language`, `genre` and `dub` metadata. We therefore run a
 * small, fixed set of title searches and keep only the items whose *metadata*
 * proves they belong to the world — never a category label sent to the search
 * box, and never a title guessed from its name.
 *
 * Verified live: `q=korean` → 30/30 results country "Korea"; `q=chinese drama`
 * → 28/28 country "China". The filter below still re-checks every item, so a
 * provider change can only shrink a world, never mislabel it.
 */

export interface HarvestSeed {
  world: "kdrama" | "cdrama" | "anime";
  query: string;
  pages: number;
  keep: (item: CatalogueItem) => boolean;
}

const isSeries = (item: CatalogueItem): boolean => item.mediaType === "series";

export const HARVEST_SEEDS: HarvestSeed[] = [
  { world: "kdrama", query: "korean", pages: 2, keep: (item) => isKorean(item) && isSeries(item) },
  { world: "kdrama", query: "k-drama", pages: 2, keep: (item) => isKorean(item) && isSeries(item) },
  { world: "cdrama", query: "chinese drama", pages: 2, keep: (item) => isChinese(item) && isSeries(item) },
  { world: "cdrama", query: "cdrama", pages: 2, keep: (item) => isChinese(item) && isSeries(item) },
  { world: "anime", query: "anime", pages: 2, keep: (item) => isAnimeItem(item) },
];

const HARVEST_PAGE_SIZE = 60;

export interface HarvestResult {
  items: CatalogueItem[];
  requests: number;
  failures: number;
}

/**
 * Run every seed in parallel. A failed page is skipped rather than failing the
 * whole catalogue: a partial world is still a useful world.
 */
export async function harvestCatalogue(signal?: AbortSignal): Promise<HarvestResult> {
  const tasks: Promise<CatalogueItem[]>[] = [];
  for (const seed of HARVEST_SEEDS) {
    for (let page = 1; page <= seed.pages; page++) {
      tasks.push(
        searchCatalogue(seed.query, page, signal, HARVEST_PAGE_SIZE).then((result) =>
          result.items.filter(seed.keep),
        ),
      );
    }
  }

  const settled = await Promise.allSettled(tasks);
  const collected: CatalogueItem[] = [];
  let failures = 0;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") collected.push(...outcome.value);
    else failures += 1;
  }
  return { items: uniqueItems(collected), requests: tasks.length, failures };
}
