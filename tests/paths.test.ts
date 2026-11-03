import { describe, expect, test } from "bun:test";
import { absolutePath, jobPaths, sanitizeFilename } from "../src/services/downloads/paths";

const BASE = "file:///data/user/0/app.hallyutv.dev/files/downloads/";

describe("absolutePath", () => {
  test("maps a registry-relative path onto the document directory", () => {
    expect(absolutePath(BASE, "downloads/Title_1_2.mp4")).toBe(`${BASE}Title_1_2.mp4`);
  });

  test("leaves already-absolute inputs untouched", () => {
    expect(absolutePath(BASE, "other.bin")).toBe(`${BASE}other.bin`);
  });
});

describe("jobPaths", () => {
  test("produces matching .part and .mp4 siblings", () => {
    const { partPath, finalPath } = jobPaths("Dead-End Job", 1, 3);
    expect(partPath).toBe("downloads/Dead-End_Job_1_3.part");
    expect(finalPath).toBe("downloads/Dead-End_Job_1_3.mp4");
  });
});

describe("sanitizeFilename", () => {
  test("strips path separators and unicode punctuation", () => {
    expect(sanitizeFilename("Squid Game: S2/영화?")).toBe("Squid_Game_S2");
  });

  test("collapses whitespace and caps length", () => {
    expect(sanitizeFilename("A   B C")).toBe("A_B_C");
    expect(sanitizeFilename("x".repeat(200)).length).toBe(64);
  });

  test("falls back to a safe name for fully-unsafe input", () => {
    expect(sanitizeFilename("???")).toBe("title");
  });
});
