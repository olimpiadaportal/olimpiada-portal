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

describe("accessPillKey — the three states a parent reads (2026-10-10)", () => {
  it("Trial Active for a child who is only on the free trial", () => {
    expect(accessPillKey("inactive", false, true)).toBe("access.trialActive");
  });
  it("Trial Expired once that trial is over and nothing else gives access", () => {
    expect(accessPillKey("inactive", false, false, true)).toBe("access.trialExpired");
    expect(accessPillKey("expired", false, false, true)).toBe("access.trialExpired");
  });
  it("Subscription Active for a paid subscription or any live entitlement", () => {
    expect(accessPillKey("active", false)).toBe("access.subscriptionActive");
    expect(accessPillKey("inactive", true)).toBe("access.subscriptionActive");
    expect(accessPillKey("locked", true)).toBe("access.subscriptionActive");
  });
  it("lets paid access outrank the trial — the family bought something", () => {
    expect(accessPillKey("inactive", true, true)).toBe("access.subscriptionActive");
    expect(accessPillKey("active", false, false, true)).toBe("access.subscriptionActive");
  });
  it("keeps the retired subscription-rail trial's own word", () => {
    expect(accessPillKey("trialing", false)).toBe("access.trialing");
  });
});

describe("accessPillKey — fails OPEN, never inventing access", () => {
  it("falls back to the raw status word when no rail reports anything", () => {
    for (const status of ["inactive", "locked", "expired"] as const) {
      expect(accessPillKey(status, false, false)).toBe(`access.${status}`);
    }
  });
  it("degrades an unknown or missing status to inactive instead of rendering a raw key", () => {
    expect(accessStatusKey(undefined)).toBe("access.inactive");
    expect(accessStatusKey(null)).toBe("access.inactive");
    expect(accessStatusKey("something_new")).toBe("access.inactive");
    expect(accessPillKey(null, false, false)).toBe("access.inactive");
  });
  it("defaults the trial flags to false, so an un-migrated caller cannot claim a trial", () => {
    expect(accessPillKey("inactive", false)).toBe("access.inactive");
  });
});

describe("accessPillKey — every key it can emit is a real trilingual string", () => {
  const emitted = new Set<string>();
  for (const status of [null, "inactive", "trialing", "active", "locked", "expired", "??"]) {
    for (const entitled of [true, false]) {
      for (const onTrial of [true, false]) {
        for (const ended of [true, false]) emitted.add(accessPillKey(status, entitled, onTrial, ended));
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

  it("never uses access.freeTrial for the trial", () => {
    // access.freeTrial's az/ru wording is identical to access.freeAccess (the
    // admin free-access window's pill), so a trial and an admin window would
    // read the same on the same dashboard.
    expect(emitted.has("access.freeTrial")).toBe(false);
    expect(messages.az["access.freeTrial"]).toBe(messages.az["access.freeAccess"]);
  });
});
