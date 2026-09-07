// The parent dashboard's per-child access pill.
//
// THE BUG THIS PINS (fixed 2026-09-07). The card rendered
// t(`access.${c.access_status}`) and nothing else. `activate_free_trial`
// (migration 140) writes neither `access_status` nor a `child_subscriptions`
// row, and the WEB is where a parent activates the trial — so the parent most
// likely to be told "Giriş yoxdur" was the one who had started a trial on this
// very site seconds earlier, over a child whose arena was already unlocked. The
// same column is equally blind to an entitlement-only grant (an Apple purchase
// made in the mobile app, an admin comp, a school licence).
//
// The mobile twin (mobile-app/src/features/parent/commerce.ts → accessPill) was
// fixed first; these cases are deliberately the same cases, because the two
// platforms answer the same question about the same child.
import { describe, expect, it } from "vitest";
import { accessPillKey, accessStatusKey } from "@/lib/accessPill";
import { messages } from "@/i18n/messages";

describe("accessPillKey — the two grants access_status cannot see", () => {
  it("labels a child who is only on the FREE TRIAL as trialing, not 'no access'", () => {
    expect(accessPillKey("inactive", false, true)).toBe("access.trialing");
  });

  it("labels a child who only holds an ENTITLEMENT as active", () => {
    expect(accessPillKey("inactive", true, false)).toBe("access.active");
  });

  it("lets an entitlement outrank a trial — the family bought something", () => {
    expect(accessPillKey("inactive", true, true)).toBe("access.active");
  });

  it("speaks for a locked or expired subscription that another rail has since covered", () => {
    // `locked`/`expired` are the subscription rail's words. A live entitlement
    // from any other rail is real access, so it wins — as it does on mobile.
    expect(accessPillKey("locked", true, false)).toBe("access.active");
    expect(accessPillKey("expired", false, true)).toBe("access.trialing");
  });
});

describe("accessPillKey — a status that already reads as access keeps its wording", () => {
  it("does not relabel a live subscription because the entitlement mirror agrees", () => {
    expect(accessPillKey("active", true, true)).toBe("access.active");
    expect(accessPillKey("trialing", true, true)).toBe("access.trialing");
  });
});

describe("accessPillKey — fails OPEN to exactly the old behaviour", () => {
  // Both readers answer false when their RPC hiccups. That must cost the nicer
  // of two words and nothing else: never a blank pill, never invented access.
  const statuses = ["inactive", "trialing", "active", "locked", "expired"] as const;

  for (const status of statuses) {
    it(`falls back to today's label for ${status}`, () => {
      expect(accessPillKey(status, false, false)).toBe(`access.${status}`);
    });
  }

  it("never invents access out of a failed read", () => {
    expect(accessPillKey("inactive", false, false)).toBe("access.inactive");
    expect(accessPillKey("locked", false, false)).toBe("access.locked");
  });

  it("degrades an unknown or missing status to inactive instead of rendering a raw key", () => {
    // The old template would have produced "access.undefined" and rendered the
    // key itself at a parent.
    expect(accessStatusKey(undefined)).toBe("access.inactive");
    expect(accessStatusKey(null)).toBe("access.inactive");
    expect(accessStatusKey("something_new")).toBe("access.inactive");
    expect(accessPillKey(null, false, false)).toBe("access.inactive");
  });

  it("defaults onTrial to false, so an un-migrated caller cannot claim a trial", () => {
    expect(accessPillKey("inactive", false)).toBe("access.inactive");
  });
});

describe("accessPillKey — every key it can emit is a real trilingual string", () => {
  const emitted = new Set<string>();
  for (const status of [null, "inactive", "trialing", "active", "locked", "expired", "??"]) {
    for (const entitled of [true, false]) {
      for (const onTrial of [true, false]) {
        emitted.add(accessPillKey(status, entitled, onTrial));
      }
    }
  }

  for (const l of ["az", "en", "ru"] as const) {
    it(`resolves in ${l}`, () => {
      for (const key of emitted) {
        const text = messages[l][key];
        expect(text, `${key} missing in ${l}`).toBeTruthy();
        expect(text).not.toBe(key);
      }
    });
  }

  it("uses access.trialing for the trial — NOT access.freeTrial", () => {
    // access.freeTrial's az/ru wording is identical to access.freeAccess (the
    // admin free-access window's pill), so a trial and an admin window would
    // read the same on the same dashboard.
    expect(emitted.has("access.freeTrial")).toBe(false);
    expect(messages.az["access.freeTrial"]).toBe(messages.az["access.freeAccess"]);
  });
});
