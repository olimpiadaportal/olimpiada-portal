import { LOCK_BACKGROUND_MS, shouldLock } from "@/features/applock/lockLogic";

const NOW = 1_700_000_000_000;

describe("app-lock timing (shouldLock)", () => {
  it("locks a restored session at cold start when enabled", () => {
    expect(
      shouldLock({ enabled: true, signedIn: true, coldStart: true, backgroundedAt: null, now: NOW }),
    ).toBe(true);
  });

  it("never locks when the flag is off", () => {
    expect(
      shouldLock({ enabled: false, signedIn: true, coldStart: true, backgroundedAt: null, now: NOW }),
    ).toBe(false);
    expect(
      shouldLock({
        enabled: false,
        signedIn: true,
        coldStart: false,
        backgroundedAt: NOW - LOCK_BACKGROUND_MS * 10,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("never locks signed-out sessions (public stack has nothing to protect)", () => {
    expect(
      shouldLock({ enabled: true, signedIn: false, coldStart: true, backgroundedAt: null, now: NOW }),
    ).toBe(false);
  });

  it("ignores a short background hop (app switcher, share sheet)", () => {
    expect(
      shouldLock({
        enabled: true,
        signedIn: true,
        coldStart: false,
        backgroundedAt: NOW - 30_000,
        now: NOW,
      }),
    ).toBe(false);
    // exactly at the boundary is still inside the grace window
    expect(
      shouldLock({
        enabled: true,
        signedIn: true,
        coldStart: false,
        backgroundedAt: NOW - LOCK_BACKGROUND_MS,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("relocks after more than 60s in the background", () => {
    expect(
      shouldLock({
        enabled: true,
        signedIn: true,
        coldStart: false,
        backgroundedAt: NOW - LOCK_BACKGROUND_MS - 1,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("does not lock a foreground resume that never backgrounded", () => {
    expect(
      shouldLock({ enabled: true, signedIn: true, coldStart: false, backgroundedAt: null, now: NOW }),
    ).toBe(false);
  });
});
