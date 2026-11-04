import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "android" || entry === "ios" || entry === ".expo") continue;
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|mjs|json)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("backend cleanup", () => {
  test("no obsolete backend/auth/pairing/proxy integrations remain in app code", () => {
    const files = walk(join(ROOT, "src")).concat(walk(join(ROOT, "plugins")));
    const forbidden = [
      /@supabase\/supabase-js/,
      /from\s+["']expo-camera["']/,
      /from\s+["']expo-secure-store["']/,
      /from\s+["']expo-web-browser["']/,
      /from\s+["']expo-linking["']/,
      /from\s+["']expo-crypto["']/,
      /react-native-qrcode-svg/,
      /react-native-reanimated/,
      /EXPO_PUBLIC_SUPABASE/,
      /EXPO_PUBLIC_RORK/,
      /EXPO_PUBLIC_MEDIA_PROXY/,
      /api\.rork\.com/,
      /supabase\.co/,
      /pairing-create|pairing-approve|pairing-consume|tv-sync/,
      /media-proxy/,
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  test("package.json no longer declares removed dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of [
      "@supabase/supabase-js",
      "expo-camera",
      "expo-crypto",
      "expo-linking",
      "expo-secure-store",
      "expo-web-browser",
      "react-native-qrcode-svg",
      "react-native-reanimated",
    ]) {
      expect(deps[name]).toBeUndefined();
    }
    expect(pkg.name).toBe("hallyu-tv");
  });
});
