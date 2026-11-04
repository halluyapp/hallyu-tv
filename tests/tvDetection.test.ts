import { describe, expect, test } from "bun:test";
import { detectTelevision, deviceLabel } from "../src/services/device/tvDetection";

describe("television detection", () => {
  test("trusts the platform TV flag", () => {
    expect(detectTelevision({ platform: "android", isTV: true, model: "Some Phone" })).toBe(true);
  });

  test("trusts an Android television UI mode", () => {
    expect(detectTelevision({ platform: "android", uiMode: "tv", model: "AOSP on rk3399" })).toBe(true);
  });

  test("detects the tvOS idiom", () => {
    expect(detectTelevision({ platform: "ios", uiMode: "tv", model: "Apple TV" })).toBe(true);
  });

  test("a normal phone stays a phone", () => {
    expect(
      detectTelevision({
        platform: "android",
        uiMode: "normal",
        brand: "Xiaomi",
        model: "Redmi Note 13",
      }),
    ).toBe(false);
  });

  test("recovers a box that reports a normal UI mode", () => {
    expect(
      detectTelevision({
        platform: "android",
        uiMode: "normal",
        brand: "Xiaomi",
        model: "Mi Box S",
      }),
    ).toBe(true);
  });

  test("recognises common Android TV boxes by name", () => {
    expect(detectTelevision({ platform: "android", uiMode: "normal", model: "MECOOL KM2" })).toBe(true);
    expect(detectTelevision({ platform: "android", uiMode: "normal", brand: "NVIDIA", model: "SHIELD Android TV" })).toBe(true);
    expect(detectTelevision({ platform: "android", uiMode: "normal", model: "Chromecast HD" })).toBe(true);
  });

  test("a tablet named after a TV product is not promoted", () => {
    expect(detectTelevision({ platform: "android", uiMode: "normal", brand: "NVIDIA", model: "SHIELD Tablet" })).toBe(false);
  });

  test("unknown devices and other platforms stay non-TV", () => {
    expect(detectTelevision({ platform: "android" })).toBe(false);
    expect(detectTelevision({ platform: "ios", uiMode: "phone", model: "iPhone 15" })).toBe(false);
    expect(detectTelevision({ platform: "web", model: "Television" })).toBe(false);
  });

  test("labels the device for the settings screen", () => {
    expect(deviceLabel({ platform: "android", brand: "Xiaomi", model: "Mi Box S" })).toBe("Xiaomi Mi Box S");
    expect(deviceLabel({ platform: "ios" })).toBe("Apple device");
  });
});
