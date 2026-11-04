import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { materials } from "../src/design-system/materials";
import { motion, scale } from "../src/design-system/motion";
import { palette, radius, spacing, tvTypeScale, typeScale } from "../src/design-system/tokens";
import { genresFromSections, availableMoods, splitGenres } from "../src/services/catalogue/genres";

const ROOT = join(import.meta.dir, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("design system integrity", () => {
  test("every palette entry is a valid colour token", () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      expect(/^(#[0-9A-Fa-f]{6}|rgba?\()/.test(value), `${name} = ${value}`).toBe(true);
    }
  });

  test("no raw colour literals outside the design system", () => {
    // Screens must consume tokens. The player is the only exemption, and only
    // for the two things a token cannot express: pure black letterboxing (the
    // platform convention) and the subtitle plate, whose opacity is tuned
    // against bright video frames rather than the app background.
    const allowed = new Set(["screens/player/PlayerScreen.tsx"]);
    // Literals permitted inside the player file, matched verbatim.
    const playerAllowed = [
      "#000",
      "#FFFFFF",
      "rgba(0,0,0,0.85)",
      "rgba(8,10,13,0.45)",
    ];
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const relative = file.replace(`${ROOT}/`, "");
      if (relative.startsWith("src/design-system/")) continue;
      const isPlayer = [...allowed].some((p) => relative.endsWith(p));
      if (isPlayer && !relative.endsWith("PlayerControls.tsx")) {
        // PlayerScreen only: drop the sanctioned literals, then audit the rest.
        const content = readFileSync(file, "utf8");
        const stripped = playerAllowed.reduce((acc, literal) => acc.split(literal).join(""), content);
        const matches = stripped.match(/#[0-9A-Fa-f]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? [];
        if (matches.length > 0) offenders.push(`${relative}: ${matches.slice(0, 3).join(", ")}`);
        continue;
      }
      const content = readFileSync(file, "utf8");
      // Hex colours and rgb()/rgba() calls with literal numbers.
      const matches = content.match(/#[0-9A-Fa-f]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? [];
      if (matches.length > 0) offenders.push(`${relative}: ${matches.slice(0, 3).join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  test("materials declare their usage and a coherent blur policy", () => {
    for (const [name, material] of Object.entries(materials)) {
      expect(material.use.length, `${name} needs a documented use`).toBeGreaterThan(0);
      if (material.blur > 0) {
        expect(material.blurMethod).not.toBe("none");
      } else {
        expect(material.blurMethod).toBe("none");
      }
    }
  });

  test("only the high-value surfaces are allowed to blur", () => {
    // Cost control: blurring everything is the fastest way to drop frames on a
    // mid-range phone, so the set is deliberately small and asserted here.
    const blurred = Object.entries(materials)
      .filter(([, m]) => m.blur > 0)
      .map(([name]) => name)
      .sort();
    expect(blurred).toEqual(["elevated", "primary"]);
  });

  test("motion tiers are ordered and none exceeds the cinematic ceiling", () => {
    expect(motion.instant).toBeLessThan(motion.fast);
    expect(motion.fast).toBeLessThan(motion.normal);
    expect(motion.normal).toBeLessThan(motion.slow);
    expect(motion.slow).toBeLessThan(motion.cinematic);
    expect(motion.cinematic).toBeLessThanOrEqual(700);
  });

  test("TV focus scale stays comfortable at ten feet", () => {
    expect(scale.focusTv).toBeGreaterThan(1);
    expect(scale.focusTv).toBeLessThanOrEqual(scale.focusTvMax);
    expect(scale.focusTvMax).toBeLessThanOrEqual(1.1);
  });

  test("the TV type scale is genuinely larger than mobile at every size", () => {
    const sizes: (keyof typeof typeScale)[] = ["hero", "display", "title", "headline", "body", "caption"];
    for (const key of sizes) {
      expect(tvTypeScale[key].fontSize).toBeGreaterThan(typeScale[key].fontSize);
    }
    // Ten-foot readability floor.
    expect(tvTypeScale.caption.fontSize).toBeGreaterThanOrEqual(16);
  });

  test("spacing and radius scales are monotonic", () => {
    const sp = Object.values(spacing);
    for (let i = 1; i < sp.length; i++) expect(sp[i]!).toBeGreaterThan(sp[i - 1]!);
    const rs = [radius.xs, radius.sm, radius.md, radius.card, radius.sheet, radius.hero];
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeGreaterThan(rs[i - 1]!);
  });
});

describe("catalogue-derived discovery", () => {
  const sections = [
    {
      section: "Banner",
      items: [{ name: "Hero", posterUrl: null, slug: "h", subjectId: "1", badge: null, rating: null, year: null, genre: "Drama", mediaType: "movie" as const }],
    },
    {
      section: "Trending",
      items: [
        { name: "A", posterUrl: null, slug: "a", subjectId: "2", badge: null, rating: "7.1", year: "2024", genre: "Drama, Romance", mediaType: "series" as const },
        { name: "B", posterUrl: null, slug: "b", subjectId: "3", badge: null, rating: "8.4", year: "2023", genre: "Drama", mediaType: "movie" as const },
      ],
    },
  ];

  test("genres are counted and ordered by frequency, banner excluded", () => {
    const genres = genresFromSections(sections);
    expect(genres[0]).toEqual({ label: "Drama", count: 2 });
    expect(genres.map((g) => g.label)).toContain("Romance");
    // The banner's Drama must not double-count.
    expect(genres.find((g) => g.label === "Drama")?.count).toBe(2);
  });

  test("moods are only offered when their genre really exists", () => {
    const moods = availableMoods(genresFromSections(sections));
    expect(moods.map((m) => m.genre)).toEqual(["Drama"]);
    expect(moods.map((m) => m.label)).toEqual(["Slow burn"]);
  });

  test("genre parsing tolerates junk", () => {
    expect(splitGenres(null)).toEqual([]);
    expect(splitGenres("")).toEqual([]);
    expect(splitGenres(" Action ,, ")).toEqual(["Action"]);
    expect(splitGenres("A".repeat(40))).toEqual([]);
  });
});
