import { describe, expect, test } from "bun:test";

describe("TV PIN session formatting and validation", () => {
  test("generates 6-digit numeric PIN", () => {
    const rawPin = Math.floor(100000 + Math.random() * 900000).toString();
    expect(rawPin).toMatch(/^\d{6}$/);
  });

  test("formats 6-digit PIN with spacing delimiter", () => {
    const raw = "749218";
    const formatted = `${raw.slice(0, 3)} - ${raw.slice(3)}`;
    expect(formatted).toBe("749 - 218");
  });

  test("validates clean PIN sanitization", () => {
    const inputWithSpaces = " 749 218 ";
    const sanitized = inputWithSpaces.replace(/\D/g, "");
    expect(sanitized).toBe("749218");
    expect(sanitized.length).toBe(6);
  });

  test("rejects invalid length PIN", () => {
    const tooShort = "1234";
    const sanitized = tooShort.replace(/\D/g, "");
    expect(sanitized.length === 6).toBe(false);
  });
});
