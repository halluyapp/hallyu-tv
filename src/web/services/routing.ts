import type { WorldKey } from "@/services/catalogue/worlds";

export type AppTab = "home" | "explore" | "downloads" | "myspace";

export interface AppRouteState {
  tab: AppTab;
  detailPath: string | null;
  world: WorldKey;
  genre: string | null;
  query: string;
}

const VALID_WORLDS = new Set<string>([
  "all",
  "trending",
  "kdrama",
  "cdrama",
  "anime",
  "hollywood",
  "bollywood",
  "south-indian",
  "indian-dramas",
  "asian-dramas",
  "western-tv",
  "cinema",
  "shorts",
  "top-series",
  "dubbed",
  "movies",
  "series",
]);

export function parseRoute(pathname: string, search: string): AppRouteState {
  const params = new URLSearchParams(search);
  const rawWorld = params.get("world");
  const world: WorldKey = rawWorld && VALID_WORLDS.has(rawWorld) ? (rawWorld as WorldKey) : "all";
  const genre = params.get("genre") || null;
  const query = params.get("q") || "";

  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean.startsWith("/title/")) {
    const encoded = clean.slice("/title/".length);
    let detailPath: string | null = null;
    try {
      detailPath = encoded ? decodeURIComponent(encoded) : null;
    } catch {
      detailPath = encoded || null;
    }
    const rawFrom = params.get("from");
    const fromTab: AppTab =
      rawFrom === "explore" || rawFrom === "downloads" || rawFrom === "myspace" ? rawFrom : "home";
    return { tab: fromTab, detailPath, world, genre, query };
  }

  if (clean === "/explore") {
    return { tab: "explore", detailPath: null, world, genre, query };
  }
  if (clean === "/downloads") {
    return { tab: "downloads", detailPath: null, world: "all", genre: null, query: "" };
  }
  if (clean === "/myspace") {
    return { tab: "myspace", detailPath: null, world: "all", genre: null, query: "" };
  }
  return { tab: "home", detailPath: null, world: "all", genre: null, query: "" };
}

export function buildRouteUrl(route: AppRouteState): string {
  const params = new URLSearchParams();
  if (route.detailPath) {
    if (route.tab !== "home") params.set("from", route.tab);
    const qs = params.toString();
    return `/title/${encodeURIComponent(route.detailPath)}${qs ? `?${qs}` : ""}`;
  }
  if (route.tab === "explore") {
    if (route.world !== "all") params.set("world", route.world);
    if (route.genre) params.set("genre", route.genre);
    if (route.query.trim()) params.set("q", route.query.trim());
    const qs = params.toString();
    return `/explore${qs ? `?${qs}` : ""}`;
  }
  if (route.tab === "downloads") return "/downloads";
  if (route.tab === "myspace") return "/myspace";
  return "/";
}
