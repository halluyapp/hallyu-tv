import { describe, expect, test } from "bun:test";
import { PlayerGuard, episodeKeyOf, resetAction } from "../src/services/player/lifecycle";

/**
 * Regression tests for the released-player crash:
 *
 *   "The 1st argument cannot be cast to type expo.modules.video.player.VideoPlayer
 *    (received class java.lang.Integer)" — Cannot use shared object that was
 *    already released.
 *
 * The native side is faked with an object that throws exactly like a released
 * SharedObject, so the guard's job is provable without a device.
 */

function releasedPlayer(): { currentTime: number } {
  return new Proxy({} as { currentTime: number }, {
    get() {
      throw new Error("Cannot use shared object that was already released");
    },
    set() {
      throw new Error("Cannot use shared object that was already released");
    },
  });
}

describe("player lifecycle guard", () => {
  test("use() runs the callback while the player is alive", () => {
    const guard = new PlayerGuard();
    const player = { currentTime: 42 } as never;
    expect(guard.use((p) => p.currentTime, player)).toBe(42);
  });

  test("use() refuses to touch a player after release", () => {
    const guard = new PlayerGuard();
    const player = { currentTime: 42 } as never;
    guard.release();
    expect(guard.isReleased).toBe(true);
    expect(guard.use((p) => p.currentTime, player)).toBeUndefined();
  });

  test("a native throw is swallowed and marks the player released", () => {
    const guard = new PlayerGuard();
    const player = releasedPlayer() as never;
    expect(() => guard.use((p) => p.currentTime, player)).not.toThrow();
    expect(guard.use((p) => p.currentTime, player)).toBeUndefined();
    // Once a native call has failed, the guard stops retrying forever.
    expect(guard.isReleased).toBe(true);
  });

  test("a null player is a no-op, not a crash", () => {
    const guard = new PlayerGuard();
    expect(guard.use((p) => p.currentTime, null)).toBeUndefined();
  });

  test("tokens invalidate work that was awaiting when the player was released", () => {
    const guard = new PlayerGuard();
    const token = guard.token();
    expect(guard.isCurrent(token)).toBe(true);
    guard.release();
    // This is the async recovery/retry/next-episode case: the await resolved
    // after unmount, so the result must be discarded.
    expect(guard.isCurrent(token)).toBe(false);
  });

  test("tokens also invalidate superseded work before any release", () => {
    const guard = new PlayerGuard();
    const older = guard.token();
    guard.release();
    guard.release();
    expect(guard.isCurrent(older)).toBe(false);
  });

  test("release is idempotent", () => {
    const guard = new PlayerGuard();
    guard.release();
    guard.release();
    expect(guard.isReleased).toBe(true);
  });
});

describe("episode reset policy", () => {
  test("a reused screen on the same episode must not reset the player", () => {
    expect(resetAction("a|b|1|2", "a|b|1|2")).toBe("none");
  });

  test("a different episode replaces the source instead of recreating the player", () => {
    expect(resetAction("a|b|1|2", "a|b|1|3")).toBe("replace");
  });

  test("episode keys are stable and distinguish every field", () => {
    const base = { subjectId: "s1", detailPath: "d1", season: 1, episode: 1 };
    expect(episodeKeyOf(base)).toBe("s1|d1|1|1");
    expect(episodeKeyOf({ ...base, episode: 2 })).not.toBe(episodeKeyOf(base));
    expect(episodeKeyOf({ ...base, season: 2 })).not.toBe(episodeKeyOf(base));
  });
});
