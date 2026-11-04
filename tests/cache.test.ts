import { describe, expect, test } from "bun:test";
import { cacheState } from "../src/services/cache/swr";

describe("stale-while-revalidate state", () => {
  test("no entry means empty, not an error", () => {
    expect(cacheState(null, 1_000, 5_000)).toBe("empty");
  });

  test("an entry inside the ttl is fresh", () => {
    expect(cacheState({ value: 1, at: 1_000 }, 4_000, 5_000)).toBe("fresh");
    expect(cacheState({ value: 1, at: 1_000 }, 6_000, 5_000)).toBe("fresh");
  });

  test("an older entry is stale so it can paint and revalidate", () => {
    expect(cacheState({ value: 1, at: 1_000 }, 6_001, 5_000)).toBe("stale");
  });
});
