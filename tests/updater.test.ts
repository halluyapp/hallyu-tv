import { describe, expect, test } from "bun:test";
import { isNewerVersion, parseSemver } from "../src/services/updater/version";

describe("updater semver checks", () => {
  test("parseSemver handles common tags and prefixes", () => {
    expect(parseSemver("1.0.0")).toEqual([1, 0, 0]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("v2.1")).toEqual([2, 1]);
  });

  test("isNewerVersion compares correctly", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(false);
  });
});
