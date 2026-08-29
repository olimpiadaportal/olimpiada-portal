// The news view beacon's at-most-once decision (src/components/ViewBeacon.tsx).
//
// WHY THIS SUITE EXISTS. A news article was reported showing 11 views and 16
// likes. The bulk of that gap is the mobile feed card's like button (fixed in
// the database by migration 157), but the web had its own small leak: when
// sessionStorage threw — private mode, blocked site data — the beacon did
// `catch { return; }`, treating "no storage" as "already viewed" and dropping
// the view, while the like button on the very same page still worked. Every
// such reader was a like with no view.
//
// The fix is a module-scoped in-memory watermark for exactly that case, and the
// two properties below are the ones a future "simplify the try/catch" would
// break: a blocked-storage reader is COUNTED, and counted only ONCE.
import { describe, expect, it, vi } from "vitest";

// ViewBeacon imports the "use server" news actions module, which pulls in
// next/headers and the request-scoped Supabase client. None of that is under
// test and none of it loads in a node environment, so it is stubbed away before
// the import is resolved.
vi.mock("@/lib/newsActions", () => ({
  registerNewsView: async () => undefined,
}));

const { shouldCountView } = await import("@/components/ViewBeacon");

/** sessionStorage stand-in that works. */
function workingStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: (k: string) => map.get(k) ?? null,
  };
}

/** sessionStorage stand-in that throws the way a privacy mode does. */
const throwingStorage = {
  getItem(): string | null {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem(): void {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

const KEY = "olympiq-viewed:qebul-imtahani-2026";

describe("shouldCountView — storage available", () => {
  it("counts the first visit and writes the watermark", () => {
    const storage = workingStorage();
    expect(shouldCountView(KEY, storage, new Set())).toBe(true);
    expect(storage.read(KEY)).toBe("1");
  });

  it("does not count a second visit in the same browser session", () => {
    const storage = workingStorage();
    const seen = new Set<string>();
    expect(shouldCountView(KEY, storage, seen)).toBe(true);
    expect(shouldCountView(KEY, storage, seen)).toBe(false);
  });

  it("counts a different article independently", () => {
    const storage = workingStorage();
    const seen = new Set<string>();
    expect(shouldCountView(KEY, storage, seen)).toBe(true);
    expect(shouldCountView("olympiq-viewed:yeni-tedris-ili", storage, seen)).toBe(true);
  });

  it("does not count a visit the watermark already covers", () => {
    expect(shouldCountView(KEY, workingStorage({ [KEY]: "1" }), new Set())).toBe(false);
  });
});

describe("shouldCountView — storage blocked (the likes-without-views leak)", () => {
  it("still counts the visit when sessionStorage throws", () => {
    // The regression this file exists for: this used to return false, so a
    // private-mode reader could like an article they were never counted as
    // having viewed.
    expect(shouldCountView(KEY, throwingStorage, new Set())).toBe(true);
  });

  it("still counts the visit when there is no storage object at all", () => {
    expect(shouldCountView(KEY, null, new Set())).toBe(true);
  });

  it("counts it only once — an effect re-run must not double-count", () => {
    const seen = new Set<string>();
    expect(shouldCountView(KEY, throwingStorage, seen)).toBe(true);
    expect(shouldCountView(KEY, throwingStorage, seen)).toBe(false);
    expect(shouldCountView(KEY, throwingStorage, seen)).toBe(false);
  });

  it("keeps the fallback per-article", () => {
    const seen = new Set<string>();
    expect(shouldCountView(KEY, throwingStorage, seen)).toBe(true);
    expect(shouldCountView("olympiq-viewed:yeni-tedris-ili", throwingStorage, seen)).toBe(true);
  });

  it("falls back when only setItem throws (a full quota, not a blocked store)", () => {
    const seen = new Set<string>();
    const halfBroken = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      },
    };
    expect(shouldCountView(KEY, halfBroken, seen)).toBe(true);
    expect(shouldCountView(KEY, halfBroken, seen)).toBe(false);
  });
});
