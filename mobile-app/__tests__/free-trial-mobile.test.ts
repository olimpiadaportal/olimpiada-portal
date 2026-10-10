// The 24 hours of free access on mobile (2026-10-10): the clock, the wizard
// step, the child's card, the parent's banner — and the store posture of each.
//
// BEHAVIOUR for the pure clock (lib/trialClock): it must run on SERVER time, so
// a phone whose clock is wrong shows what the web shows. SOURCE for the parts
// that exist only as an arrangement of code: the wizard step calls the BFF and
// nothing else, the banner's CTA exists only behind the build-time store-rail
// constant (iOS and, since the owner decision of 2026-10-10, Android), and no
// trial surface reaches a purchase API.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clockSkewMs,
  formatRemaining,
  parseTrialState,
  requiredTrialSubjects,
  trialErrorKey,
  trialRemaining,
} from "@/lib/trialClock";
import { messages } from "@/i18n/messages.generated";
import { mobileMessages } from "@/i18n/messages.mobile";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("trialClock — server time, not device time", () => {
  const ends = "2026-10-10T12:00:00.000Z";

  it("measures the skew at the moment the answer arrived", () => {
    const server = "2026-10-10T10:00:00.000Z";
    // The device clock is 5 minutes FAST.
    const received = Date.parse(server) + 5 * 60_000;
    expect(clockSkewMs(server, received)).toBe(-5 * 60_000);
  });

  it("shows the same remaining time whatever the device clock says", () => {
    const server = "2026-10-10T10:00:00.000Z";
    for (const drift of [0, 5 * 60_000, -42 * 60_000, 3 * 3600_000]) {
      const received = Date.parse(server) + drift;
      const skew = clockSkewMs(server, received);
      // 30 seconds after the answer arrived, on that device's clock.
      const r = trialRemaining(ends, skew, received + 30_000);
      expect(r).toEqual({ h: 1, m: 59, s: 30, done: false });
    }
  });

  it("falls back to the device clock when the server time is unknown", () => {
    expect(clockSkewMs(null, 123)).toBe(0);
    expect(clockSkewMs("not a date", 123)).toBe(0);
  });

  it("clamps at zero and reports done", () => {
    expect(trialRemaining(ends, 0, Date.parse(ends) + 1)).toEqual({ h: 0, m: 0, s: 0, done: true });
    expect(trialRemaining(null, 0, 0).done).toBe(true);
  });

  it("formats with translated units and padded minutes/seconds", () => {
    expect(formatRemaining({ h: 23, m: 5, s: 7 }, { h: "h", m: "m", s: "s" })).toBe("23h 05m 07s");
  });
});

describe("parseTrialState — fails closed", () => {
  it("reads the full payload", () => {
    const s = parseTrialState(
      {
        active: true,
        used: true,
        ends_at: "2026-10-11T10:00:00Z",
        server_now: "2026-10-10T10:00:00Z",
        extended: true,
        subjects: [{ id: "a", code: "math", name: "Riyaziyyat" }, { id: "" }],
      },
      99,
    );
    expect(s.active).toBe(true);
    expect(s.used).toBe(true);
    expect(s.extended).toBe(true);
    expect(s.receivedAt).toBe(99);
    expect(s.subjects).toEqual([{ id: "a", code: "math", name: "Riyaziyyat" }]);
  });
  it("turns garbage into no trial", () => {
    for (const bad of [null, undefined, "x", 3]) {
      const s = parseTrialState(bad, 1);
      expect(s.active).toBe(false);
      expect(s.used).toBe(false);
      expect(s.endsAt).toBeNull();
    }
  });
});

describe("the two-subject rule", () => {
  it("asks for exactly two, or every subject when the grade studies fewer", () => {
    expect(requiredTrialSubjects(7)).toBe(2);
    expect(requiredTrialSubjects(2)).toBe(2);
    expect(requiredTrialSubjects(1)).toBe(1);
    expect(requiredTrialSubjects(0)).toBe(0);
  });
});

describe("refusals are the app's own sentences", () => {
  it("maps every BFF trial key to a store-safe mobile key", () => {
    expect(trialErrorKey("trial.err.alreadyUsed")).toBe("mob.trial.err.used");
    expect(trialErrorKey("trial.err.limitReached")).toBe("mob.trial.err.limit");
    expect(trialErrorKey("trial.err.alreadyCovered")).toBe("mob.trial.err.covered");
    expect(trialErrorKey("trial.err.tooMany")).toBe("mob.trial.err.subjects");
    expect(trialErrorKey("trial.err.somethingNew")).toBe("mob.trial.err.generic");
    expect(trialErrorKey("mob.err.network")).toBe("mob.err.network");
  });
});

describe("the wizard step", () => {
  const wizard = read("src/app/(parent)/add-child.tsx");
  const picker = read("src/features/trial/TrialPicker.tsx");

  it("runs Info → free access → Done when payments are live, and skips it otherwise", () => {
    expect(wizard).toContain('["info", "trial", "done"]');
    expect(wizard).toContain('posture.freeFlow || posture.mode === "off" ? ["info", "done"]');
    expect(wizard).toContain("<TrialPicker");
  });

  it("starts the window through the BFF and touches no purchase API", () => {
    expect(picker).toContain("bffStartTrial(");
    for (const banned of ["features/iap", "StoreKit", "requestPurchase", "Linking.openURL", "olympiq.ai"]) {
      expect(picker).not.toContain(banned);
    }
  });

  it("can be skipped", () => {
    expect(picker).toContain('t("mob.trial.skip")');
    expect(wizard).toContain('onSkip={() => setPhase("done")}');
  });
});

describe("the parent's banner is per platform, as a build-time fact", () => {
  const banner = read("src/features/trial/TrialEndedBanner.tsx");
  // The CTA used to be iOS-only because Android was purchase-silent. Owner
  // decision 2026-10-10: Android sells through Google Play, so the same
  // build-time constant now opens it on both stores. What still matters, and
  // is still pinned: the CTA is gated by a BUILD-TIME constant (never config),
  // and it leads to an in-app screen, not a URL.
  it("shows its one CTA only behind the build-time store-rail constant", () => {
    expect(banner).toContain('import { IAP_PLATFORM_SUPPORTED } from "@/features/iap/platform";');
    expect(banner).toMatch(/\{IAP_PLATFORM_SUPPORTED \? \(\s*<Button/);
    expect(banner).not.toMatch(/useMobileConfig|flags\./);
    // In-app route only: no external link, no web checkout.
    expect(banner).toContain('pathname: "/(parent)/children/[id]/subscribe"');
    expect(banner).not.toMatch(/Linking|openURL|openBrowserAsync|https?:\/\//);
  });
  it("is never on the child's side, and the countdown never on the parent's", () => {
    const parentHome = read("src/app/(parent)/(tabs)/home.tsx");
    const childHome = read("src/app/(student)/(tabs)/home.tsx");
    expect(parentHome).not.toContain("ChildTrialCard");
    expect(parentHome).not.toContain("useTrialCountdown");
    expect(childHome).toContain("<ChildTrialCard");
    expect(childHome).not.toContain("TrialEndedBanners");
  });
});

describe("copy", () => {
  const KEYS = [
    "mob.trial.title", "mob.trial.body", "mob.trial.start", "mob.trial.pick", "mob.trial.count",
    "mob.trial.skip", "mob.trial.none", "mob.trial.started", "mob.trial.subjects", "mob.trial.endsIn",
    "mob.trial.step", "mob.trial.card.title", "mob.trial.card.remaining", "mob.trial.card.ended",
    "mob.trial.card.endedNote", "mob.trial.card.extended", "mob.trial.banner.body",
    "mob.trial.banner.bodyStore", "mob.trial.banner.cta", "mob.trial.banner.dismiss",
    "mob.trial.err.used", "mob.trial.err.limit", "mob.trial.err.subjects", "mob.trial.err.covered",
    "mob.trial.err.generic", "mob.child.manageAccess", "mob.access.trialActive", "mob.access.trialExpired",
  ];
  it("exists in all three languages", () => {
    for (const l of ["az", "en", "ru"] as const) {
      for (const k of KEYS) {
        const v = mobileMessages[l]?.[k] ?? messages[l]?.[k];
        expect(v?.trim()).toBeTruthy();
      }
    }
  });
  it("names 24 hours and 2 subjects in the offer", () => {
    for (const l of ["az", "en", "ru"] as const) {
      expect(mobileMessages[l]["mob.trial.title"]).toMatch(/24/);
      expect(mobileMessages[l]["mob.trial.title"]).toMatch(/2/);
    }
  });
  it("keeps the web's trial-selling copy out of the binary", () => {
    for (const l of ["az", "en", "ru"] as const) {
      for (const k of [
        "addchild.trial.title", "parent.trialBanner.body", "parent.trialBanner.cta", "trial.child.title",
        "access.trialActive", "access.trialExpired",
      ]) {
        expect(messages[l][k]).toBeUndefined();
      }
    }
  });
});
