// The OPTIONAL (skippable) update prompt.
//
// WHY THIS FILE EXISTS. `updateAvailable` was computed and unit-tested for
// months while NOTHING rendered it, so the platform could FORCE an update but
// not SUGGEST one. The suggestion is only safe if three things hold, and none
// of them is visible in a type: it never appears when the hard gate is up, it
// never appears because a config fetch failed, and it never turns into a hard
// gate by being `return`ed in place of the navigator. Each gets a test here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateVersionGate, parseMobileConfig } from "@/lib/mobileConfig";
import { mobileMessages } from "../src/i18n/messages.mobile";
import {
  normalizeVersion,
  shouldPromptOptionalUpdate,
  UPDATE_PROMPT_KEY,
  useUpdatePrompt,
} from "@/lib/updatePrompt";

// In-memory SecureStore. The `mock` name prefix is what lets jest's hoisted
// factory reference these.
const mockStore = new Map<string, string>();
let mockThrows = false;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => {
    if (mockThrows) throw new Error("keystore unavailable");
    return mockStore.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (mockThrows) throw new Error("keystore unavailable");
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  mockThrows = false;
  useUpdatePrompt.setState({ dismissedVersion: null, hydrated: false });
});

/** A prompt-worthy baseline; each test breaks exactly one thing. */
const READY = {
  hydrated: true,
  forceUpdate: false,
  updateAvailable: true,
  latestVersion: "1.14.0",
  storeUrl: "https://play.google.com/store/apps/details?id=ai.olympiq.app",
  dismissedVersion: null as string | null,
};

describe("dismissal persistence (skip THIS version, not all of them)", () => {
  it("round-trips the dismissed version through SecureStore", async () => {
    useUpdatePrompt.getState().dismiss("1.14.0");
    expect(useUpdatePrompt.getState().dismissedVersion).toBe("1.14.0");
    // The write is fire-and-forget; let it settle before reading it back.
    await Promise.resolve();
    expect(mockStore.get(UPDATE_PROMPT_KEY)).toBe("1.14.0");

    // A fresh boot sees it.
    useUpdatePrompt.setState({ dismissedVersion: null, hydrated: false });
    await useUpdatePrompt.getState().hydrate();
    expect(useUpdatePrompt.getState().dismissedVersion).toBe("1.14.0");
    expect(useUpdatePrompt.getState().hydrated).toBe(true);
  });

  it("resolves an absent value to 'not dismissed'", async () => {
    await useUpdatePrompt.getState().hydrate();
    expect(useUpdatePrompt.getState().dismissedVersion).toBe(null);
    expect(useUpdatePrompt.getState().hydrated).toBe(true);
  });

  it("resolves a corrupt value to 'not dismissed' rather than trusting it", async () => {
    const junkValues = [
      "",
      "   ",
      "true",
      "1",
      "{}",
      '{"v":"1.14.0"}',
      "1.14.0-beta",
      "x".repeat(64),
    ];
    for (const junk of junkValues) {
      mockStore.set(UPDATE_PROMPT_KEY, junk);
      useUpdatePrompt.setState({ dismissedVersion: "9.9.9", hydrated: false });
      await useUpdatePrompt.getState().hydrate();
      expect(useUpdatePrompt.getState().dismissedVersion).toBe(null);
    }
  });

  it("survives a SecureStore that throws, and still finishes hydrating", async () => {
    mockThrows = true;
    await expect(useUpdatePrompt.getState().hydrate()).resolves.toBeUndefined();
    expect(useUpdatePrompt.getState().hydrated).toBe(true);
    expect(useUpdatePrompt.getState().dismissedVersion).toBe(null);
  });

  it("refuses to persist an uncomparable version", async () => {
    useUpdatePrompt.getState().dismiss("not-a-version");
    await Promise.resolve();
    // Recording it would silence EVERY later prompt, since it could never be
    // compared against a real latest_version.
    expect(mockStore.has(UPDATE_PROMPT_KEY)).toBe(false);
    expect(useUpdatePrompt.getState().dismissedVersion).toBe(null);
  });

  it("normalizeVersion accepts real versions only", () => {
    expect(normalizeVersion("1.14.0")).toBe("1.14.0");
    expect(normalizeVersion(" 1.14 ")).toBe("1.14");
    expect(normalizeVersion(null)).toBe(null);
    expect(normalizeVersion("1")).toBe(null);
  });
});

describe("shouldPromptOptionalUpdate", () => {
  it("prompts for a newer version with a reachable store", () => {
    expect(shouldPromptOptionalUpdate(READY)).toBe(true);
  });

  it("stays silent for the version the user already skipped", () => {
    expect(shouldPromptOptionalUpdate({ ...READY, dismissedVersion: "1.14.0" })).toBe(false);
  });

  it("prompts again when a NEWER version lands after a skip", () => {
    // The whole reason the dismissal stores a version string and not a boolean.
    expect(
      shouldPromptOptionalUpdate({
        ...READY,
        latestVersion: "1.15.0",
        dismissedVersion: "1.14.0",
      }),
    ).toBe(true);
  });

  it("compares dismissals numerically, not lexicographically", () => {
    // 1.9.0 < 1.10.0 — the string comparison says the opposite.
    expect(
      shouldPromptOptionalUpdate({
        ...READY,
        latestVersion: "1.10.0",
        dismissedVersion: "1.9.0",
      }),
    ).toBe(true);
    expect(
      shouldPromptOptionalUpdate({
        ...READY,
        latestVersion: "1.9.0",
        dismissedVersion: "1.10.0",
      }),
    ).toBe(false);
  });

  it("NEVER shows next to a forced update — the hard gate owns the screen", () => {
    expect(shouldPromptOptionalUpdate({ ...READY, forceUpdate: true })).toBe(false);
  });

  it("stays silent until the dismissal store has hydrated", () => {
    expect(shouldPromptOptionalUpdate({ ...READY, hydrated: false })).toBe(false);
  });

  it("stays silent without a reachable store URL", () => {
    expect(shouldPromptOptionalUpdate({ ...READY, storeUrl: "" })).toBe(false);
    expect(shouldPromptOptionalUpdate({ ...READY, storeUrl: "market://details" })).toBe(false);
  });

  it("stays silent on a missing or short latest_version", () => {
    const bad = ["", "0", "latest", "  "];
    for (const latestVersion of bad) {
      expect(shouldPromptOptionalUpdate({ ...READY, latestVersion })).toBe(false);
    }
  });
});

describe("fail open: a config problem produces no prompt", () => {
  // An empty/garbage payload is what a broken RPC, an old server or a partial
  // response looks like after parseMobileConfig(). It must read as "nothing to
  // update to", never as "prompt everyone".
  const ask = (raw: unknown, appVersion = "1.13.0"): boolean => {
    const cfg = parseMobileConfig(raw);
    const gate = evaluateVersionGate(cfg, "android", appVersion);
    return shouldPromptOptionalUpdate({
      hydrated: true,
      forceUpdate: gate.forceUpdate,
      updateAvailable: gate.updateAvailable,
      latestVersion: cfg.version.android.latest,
      storeUrl: gate.storeUrl,
      dismissedVersion: null,
    });
  };

  it("no payload at all", () => {
    expect(ask(null)).toBe(false);
    expect(ask({})).toBe(false);
    expect(ask("not json")).toBe(false);
  });

  it("the live production defaults (min/latest 1.0.0, no store URL) stay inert", () => {
    expect(
      ask({
        version: {
          android: { min: "1.0.0", latest: "1.0.0", force: false, store_url: "" },
        },
      }),
    ).toBe(false);
  });

  it("a newer latest_version with no store URL configured still says nothing", () => {
    expect(
      ask({
        version: {
          android: { min: "1.0.0", latest: "1.14.0", force: false, store_url: "" },
        },
      }),
    ).toBe(false);
  });

  it("a real soft nudge does prompt", () => {
    expect(
      ask({
        version: {
          android: {
            min: "1.0.0",
            latest: "1.14.0",
            force: false,
            store_url: "https://play.google.com/store/apps/details?id=ai.olympiq.app",
          },
        },
      }),
    ).toBe(true);
  });
});

// The regression that would quietly turn the suggestion into a blocking gate:
// `return <UpdateAvailableOverlay/>` instead of rendering it WITH the Stack.
// It type-checks, it looks tidier, and it unmounts navigation and disables
// Android back for every user on an old build. Only a source read catches it.
describe("RootGate renders the optional update WITH the navigator", () => {
  const source = readFileSync(
    join(__dirname, "..", "src", "features", "boot", "RootGate.tsx"),
    "utf8",
  );

  it("uses the overlay at all", () => {
    expect(source).toContain("UpdateAvailableOverlay");
    expect(source).toContain("shouldPromptOptionalUpdate");
  });

  it("never returns the overlay in place of the Stack", () => {
    expect(/return\s*\(?\s*<UpdateAvailableOverlay/.test(source)).toBe(false);
  });

  it("paints it after the Stack and before the lock overlay", () => {
    const stack = source.indexOf("<Stack");
    const overlay = source.indexOf("<UpdateAvailableOverlay");
    const lock = source.indexOf("<LockOverlay");
    expect(stack).toBeGreaterThan(-1);
    expect(overlay).toBeGreaterThan(stack);
    // A locked app must not show an update card over its own lock screen.
    expect(lock).toBeGreaterThan(overlay);
  });
});

describe("the optional-update copy ships in all three languages and sells nothing", () => {
  const KEYS = [
    "mob.updateAvailable.title",
    "mob.updateAvailable.body",
    "mob.updateAvailable.cta",
    "mob.updateAvailable.later",
    "mob.update.openFailed",
  ];
  // Same rule as store-copy.test.ts: the binary is purchase-silent, and an
  // update prompt is not an exception to it.
  const BANNED =
    /AZN|₼|manat|\d\s*%|https?:\/\/|olympiq\.ai|abunə ol|satın al|subscribe|купит|подписатьс/i;

  for (const locale of ["az", "en", "ru"] as const) {
    for (const key of KEYS) {
      it(`${locale} ${key}`, () => {
        const value = mobileMessages[locale]?.[key] ?? "";
        expect(value.trim().length).toBeGreaterThan(0);
        expect(BANNED.test(value)).toBe(false);
      });
    }
  }

  it("does not reuse the MANDATORY wording for a suggestion", () => {
    // "no longer supported" under a "Later" button is a contradiction.
    expect(mobileMessages.az["mob.updateAvailable.body"]).not.toContain("dəstəklənmir");
    expect(mobileMessages.en["mob.updateAvailable.body"]).not.toContain("no longer supported");
    expect(mobileMessages.ru["mob.updateAvailable.body"]).not.toContain("не поддерживается");
  });
});
