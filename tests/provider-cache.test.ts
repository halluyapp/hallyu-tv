import { beforeEach, describe, expect, test } from "bun:test";
import { _inflightCount, cached, clearCache, forget, peek, write } from "../src/services/provider/cache";

describe("provider cache", () => {
  beforeEach(() => clearCache());

  test("concurrent callers share one network request", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return ["a"];
    };
    const [one, two, three] = await Promise.all([
      cached("home", "all", loader),
      cached("home", "all", loader),
      cached("home", "all", loader),
    ]);
    expect(calls).toBe(1);
    expect(one).toEqual(two);
    expect(two).toEqual(three);
    expect(_inflightCount()).toBe(0);
  });

  test("a fresh entry is served without touching the network", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return ["fresh"];
    };
    await cached("home", "all", loader);
    await cached("home", "all", loader);
    expect(calls).toBe(1);
  });

  test("a stale entry is returned immediately and revalidated in the background", async () => {
    write("home", "all", ["stale"]);
    // Age the entry past its fresh window but inside its stale window.
    const entry = peek<string[]>("home", "all");
    expect(entry?.value).toEqual(["stale"]);

    let background: string[] | undefined;
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return ["newer"];
    };

    // Fresh window is 90s; simulate staleness by forcing the clock forward.
    const realNow = Date.now;
    Date.now = () => realNow() + 120_000;
    try {
      const value = await cached("home", "all", loader, { onBackground: (v) => (background = v) });
      expect(value).toEqual(["stale"]);
      await new Promise((r) => setTimeout(r, 10));
      expect(calls).toBe(1);
      expect(background).toEqual(["newer"] as string[]);
    } finally {
      Date.now = realNow;
    }
  });

  test("force bypasses the fresh window", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return [String(calls)];
    };
    await cached("home", "all", loader);
    await cached("home", "all", loader, { force: true });
    expect(calls).toBe(2);
  });

  test("a failed request is not cached and can be retried", async () => {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error("network");
    };
    await expect(cached("detail", "abc", failing)).rejects.toThrow("network");
    await expect(cached("detail", "abc", failing)).rejects.toThrow("network");
    expect(calls).toBe(2);
  });

  test("forget drops a single entry so a pull-to-refresh re-fetches", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return ["v"];
    };
    await cached("home", "all", loader);
    forget("home", "all");
    await cached("home", "all", loader);
    expect(calls).toBe(2);
  });
});
