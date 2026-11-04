import { describe, expect, test } from "bun:test";
import { cueAt, parseSrt, parseSubtitles, parseVtt, srtToVtt } from "../src/services/subtitles/srt";

const SAMPLE = [
  "1",
  "00:01:12,567 --> 00:01:15,000",
  "Hello there.",
  "",
  "2",
  "00:01:15,5 --> 00:01:17,56",
  "Second line, one-digit fraction.",
  "",
  "3",
  "01:00:00,000 --> 01:00:02,000",
  "<i>Styled</i> text",
].join("\n");

describe("parseSrt", () => {
  test("parses a 3-digit millisecond fraction", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues[0]!.startMs).toBe(72_567);
    expect(cues[0]!.endMs).toBe(75_000);
  });

  test("scales short fractions correctly (,5 = 500ms, ,56 = 560ms)", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues[1]!.startMs).toBe(75_500);
    expect(cues[1]!.endMs).toBe(77_560);
  });

  test("supports hour offsets and dot fraction separator", () => {
    const cues = parseSrt("1\n1:00:00.000 --> 1:00:02,000\nLate.");
    expect(cues[0]!.startMs).toBe(3_600_000);
    expect(cues[0]!.endMs).toBe(3_602_000);
  });

  test("strips inline markup and skips index lines", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues[2]!.text).toBe("Styled text");
  });

  test("returns no cues for empty or malformed input", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("not a subtitle file")).toEqual([]);
  });

  test("handles CRLF and BOM", () => {
    const cues = parseSrt("\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHi.\r\n");
    expect(cues[0]!.text).toBe("Hi.");
  });
});

describe("parseVtt / parseSubtitles", () => {
  const VTT = "WEBVTT\n\n00:00:05.500 --> 00:00:07.000 align:start position:0%\nHi.\n";

  test("parses WebVTT with cue settings", () => {
    const cues = parseVtt(VTT);
    expect(cues[0]!.startMs).toBe(5_500);
    expect(cues[0]!.text).toBe("Hi.");
  });

  test("auto-detects WebVTT", () => {
    expect(parseSubtitles(VTT)[0]!.text).toBe("Hi.");
    expect(parseSubtitles(SAMPLE)[0]!.text).toBe("Hello there.");
  });
});

describe("cueAt", () => {
  const cues = parseSrt(SAMPLE);

  test("returns the active cue", () => {
    expect(cueAt(cues, 73_000)?.text).toBe("Hello there.");
  });

  test("positive delay shows subtitles later", () => {
    // At 73s with +1s delay, the effective cue time is 72s (before the cue).
    expect(cueAt(cues, 73_000, 1_000)).toBeNull();
    // At 73.6s with +1s delay, effective time is 72.6s (inside the cue).
    expect(cueAt(cues, 73_600, 1_000)?.text).toBe("Hello there.");
  });

  test("negative delay advances subtitles", () => {
    expect(cueAt(cues, 72_000, -600)?.text).toBe("Hello there.");
  });

  test("returns null between cues and outside range", () => {
    expect(cueAt(cues, 75_200)).toBeNull();
    expect(cueAt(cues, 0)).toBeNull();
  });
});

describe("srtToVtt", () => {
  test("emits WEBVTT with dot milliseconds, zero-padded to 3 digits", () => {
    const vtt = srtToVtt("1\n00:00:05,500 --> 00:00:07,000\nHi.");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:05.500 --> 00:00:07.000");
  });
});
