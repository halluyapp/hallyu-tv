import { describe, expect, test } from "bun:test";
import { resolveTier, stageMetrics } from "../src/design-system/stage";

describe("stage tiers", () => {
  test("an Android box at 1080p resolves to the 10-foot stage", () => {
    expect(resolveTier(1920, 1080, false, "auto")).toBe("stage");
    expect(resolveTier(960, 540, true, "auto")).toBe("stage");
  });

  test("the display-mode override wins over platform signals", () => {
    expect(resolveTier(390, 844, false, "tv")).toBe("stage");
    expect(resolveTier(1920, 1080, true, "tablet")).toBe("regular");
  });

  test("phones and tablets keep their own tiers", () => {
    expect(resolveTier(390, 844, false, "auto")).toBe("compact");
    expect(resolveTier(1024, 768, false, "auto")).toBe("regular");
  });
});

describe("stage metrics", () => {
  test("stage cards scale with the panel instead of a fixed 170dp", () => {
    const small = stageMetrics(960, 540, "stage", true);
    const large = stageMetrics(1920, 1080, "stage", true);
    expect(small.posterWidth / 960).toBeGreaterThan(0.15);
    expect(small.posterWidth / 960).toBeLessThan(0.18);
    expect(large.posterWidth).toBeGreaterThan(small.posterWidth * 1.9);
  });

  test("remote type and targets are larger than phone targets", () => {
    const tv = stageMetrics(1920, 1080, "stage", true);
    const phone = stageMetrics(390, 844, "compact", false);
    expect(tv.heroTitleSize).toBeGreaterThan(phone.heroTitleSize);
    expect(tv.controlSize).toBeGreaterThan(phone.controlSize);
    expect(tv.spineWidth).toBeGreaterThanOrEqual(180);
    expect(tv.focusRing).toBeGreaterThanOrEqual(2);
  });

  test("cards and the hero always fit inside the viewport", () => {
    const cases = [
      [390, 844, "compact"],
      [1024, 768, "regular"],
      [960, 540, "stage"],
      [1920, 1080, "stage"],
    ] as const;
    for (const [width, height, tier] of cases) {
      const stage = stageMetrics(width, height, tier, tier === "stage");
      expect(stage.posterWidth).toBeGreaterThan(0);
      expect(stage.posterWidth * 3).toBeLessThan(width);
      expect(stage.heroHeight).toBeGreaterThan(0);
      expect(stage.heroHeight).toBeLessThanOrEqual(height);
      expect(stage.gutter * 2).toBeLessThan(width);
    }
  });
});
