// The store binary must not report a PAYMENT STATE.
//
// APPLE REJECTED the 2026-08-26 submission under 2.1.0 Performance: App
// Completeness. The parent Subscription tab rendered:
//
//     "Plans & subjects — Payments are temporarily paused. New subscriptions
//      and purchases are unavailable right now."
//
// That is `gate.paymentsOff`, a WEB string, rendered because three screens
// branched on `posture.paymentsOff` — a value derived from a database row. So
// the binary's behaviour changed with a server flag, which is exactly what
// CLAUDE.md forbids: "Payment posture is a BUILD-TIME constant, never a server
// flag." A reviewer reads a feature that announces itself unavailable as an
// unfinished feature.
//
// This test is SOURCE-LEVEL on purpose. It does not render screens; it asserts
// that no screen imports the vocabulary. Re-introducing the branch then shows up
// in a diff and in this failure, rather than in a rejection eight days later.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Every source file except the generated catalogue, which is data, not a render. */
const FILES = walk(SRC).filter((p) => !p.endsWith("messages.generated.ts"));

/** A `t("key")` / `t('key')` call — an actual RENDER, not a mention. */
function rendersKey(source: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`t\\(\\s*["'\`]${escaped}["'\`]`).test(source);
}

describe("no screen renders a payment-state message", () => {
  // These are WEB strings. They are correct on olympiq.ai, where purchasing is
  // legal and a pause is real information. Inside a store binary they are a
  // server flag telling a reviewer the app is half-built.
  const BANNED_KEYS = ["gate.paymentsOff", "gate.giveawayFree", "gate.freeAccess"];

  for (const key of BANNED_KEYS) {
    it(`does not render ${key}`, () => {
      const offenders = FILES.filter((p) => rendersKey(readFileSync(p, "utf8"), key)).map((p) =>
        p.slice(SRC.length + 1),
      );
      expect(offenders).toEqual([]);
    });
  }
});

describe("the mobile answer is one unchanging sentence", () => {
  it("still ships mob.pay.notInApp in all three locales", () => {
    // The replacement for every branch above. It is true whatever the server
    // says, which is the entire point — it cannot become false because a row
    // changed.
    const mobile = readFileSync(join(SRC, "i18n", "messages.mobile.ts"), "utf8");
    const hits = mobile.match(/"mob\.pay\.notInApp"/g) ?? [];
    expect(hits.length).toBe(3);
  });

  it("names no purchase verb", () => {
    const mobile = readFileSync(join(SRC, "i18n", "messages.mobile.ts"), "utf8");
    const line = mobile
      .split("\n")
      .filter((l) => l.includes("mob.pay.notInApp"))
      .join(" ")
      .toLowerCase();
    for (const banned of ["abunə ol", "subscribe", "подписатьс", "buy", "satın al", "купит"]) {
      expect(line.includes(banned)).toBe(false);
    }
  });
});

describe("the subscription tab always says something", () => {
  // Deleting the notice without replacing it would leave a blank area for a
  // family with no subscription — which is the SAME rejection reason.
  const tab = readFileSync(
    join(SRC, "app", "(parent)", "(tabs)", "subscription.tsx"),
    "utf8",
  );

  it("renders the not-managed-here sentence", () => {
    expect(rendersKey(tab, "mob.pay.notInApp")).toBe(true);
  });

  it("no longer branches on paymentsOff", () => {
    // The posture field still exists for the free-activation flow; this screen
    // must simply not consult it to decide what to SAY about payments.
    const code = tab.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
    expect(code).not.toMatch(/posture\.paymentsOff\s*\?/);
  });
});
