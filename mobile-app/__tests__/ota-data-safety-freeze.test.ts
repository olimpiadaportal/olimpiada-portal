// An OTA update can put a NEW DATA COLLECTION onto a binary already in review.
//
// THE HAZARD. `app.json` pins `runtimeVersion: {policy: "appVersion"}` at
// 1.15.0 and `eas.json` maps the production profile to channel "production".
// That policy is normally read as a safety rail — "a bump means a new build,
// never an OTA" — but it cuts both ways: while the version does NOT move, every
// change sitting in this repo is deliverable over the air onto 1.15.0 build 5,
// the binary in App Review. Among them is the optional child `gender` field
// (migration 169), which collects a MINOR's personal data, while build 5's App
// Store *App Privacy* and Play *Data safety* answers say no such data is
// collected. Publishing it would make a live build's data-safety declaration
// false — not a bug a later patch undoes.
//
// WHY THE EXISTING WORDS DID NOT COVER IT. `docs/STORE_LISTING_COPY.md` §8 and
// `STATUS.md` both guard the field with "before the next submission". An
// `eas update` is not a submission, so neither sentence bites — and root
// `CLAUDE.md` positively RECOMMENDS an OTA as the way to reach existing installs
// without a store round-trip. The reflex and the guard were in different files.
//
// WHAT THIS TEST DOES, AND WHAT IT CANNOT DO. It cannot stop an `eas update`:
// EAS runs that command outside this repository and offers no hook we control,
// so nothing here executes at the moment the mistake is made. What it CAN do is
// keep the written rule alive for exactly as long as the hazard is: while the
// source still collects gender AND `expo.version` is still the frozen one, the
// freeze must be stated in root `CLAUDE.md`, where someone reaching for an OTA
// is actually standing. A rule without its reason gets deleted by the next
// person who finds it inconvenient; this is what fails when that happens.
//
// IT RETIRES ITSELF. The hazard ends when `expo.version` leaves 1.15.0 — an
// update published for a newer version can never reach a 1.15.0 binary — or
// when the field stops being collected. Either way this test goes quiet and the
// `CLAUDE.md` bullet can be deleted. Do NOT bump the version to silence it: that
// abandons build 5 mid-review, and is the owner's call when they cut the next
// build.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Same source-level idiom as child-gender-optional.test.ts. */
const readApp = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", ...parts), "utf8");
const readRepo = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", "..", ...parts), "utf8");

/**
 * The version whose store declarations do NOT list the child gender field.
 * Recorded here because nothing in this repository is generated from App Store
 * Connect: 1.15.0 build 5 was submitted 2026-09-04 (`CHANGELOG.md`) against the
 * declarations as they stood then — narrower even than the inventory of that day,
 * because the 2026-09-08 audit found nine collected rows neither form declared and
 * took `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2 to TEN data types. Those nine
 * are overdue on the LIVE forms rather than gated on a release, since they ship in
 * builds already out. Gender is the one row that genuinely waits for the build that
 * first collects it — which is the hazard this test exists for.
 */
const FROZEN_VERSION = "1.15.0";

/** The marker the rule must keep. Short on purpose — a reword should not fail. */
const FREEZE_MARKER = "OTA FREEZE";

const APP_JSON = JSON.parse(readApp("app.json")) as {
  expo: { version: string; runtimeVersion?: { policy?: string } };
};

/** Normalised: CLAUDE.md's line endings are not this test's business. */
const CLAUDE_MD = readRepo("CLAUDE.md").replace(/\r\n/g, "\n");

/**
 * Is the field still in the shipping source? `some`, not `every`: either half
 * of the path — the control that asks, or the client that sends — is enough for
 * an OTA to change what a parent on build 5 is asked for.
 */
const COLLECTS_GENDER = [
  readApp("src", "features", "parent", "ChildInfoForm.tsx"),
  readApp("src", "lib", "api.ts"),
].some((source) => /\bgender\b/.test(source));

const HAZARD_LIVE = COLLECTS_GENDER && APP_JSON.expo.version === FROZEN_VERSION;

describe("OTA freeze while the in-review build's data-safety answers are stale", () => {
  it("keeps the freeze rule in root CLAUDE.md for as long as the hazard is live", () => {
    if (!HAZARD_LIVE) {
      // Spent. Leaving the bullet in place is harmless, so nothing is demanded.
      expect(HAZARD_LIVE).toBe(false);
      return;
    }

    expect(CLAUDE_MD).toContain(FREEZE_MARKER);

    // The rule must name the version it freezes, or a bullet left over from an
    // earlier freeze would satisfy a later one and guard nothing.
    const start = CLAUDE_MD.indexOf(FREEZE_MARKER);
    expect(CLAUDE_MD.slice(start, start + 2500)).toContain(FROZEN_VERSION);
  });

  it("still rests on runtimeVersion: appVersion", () => {
    if (!HAZARD_LIVE) {
      expect(HAZARD_LIVE).toBe(false);
      return;
    }

    // Both halves of the rule are derived from this one line: that an OTA
    // reaches build 5 at all, and that bumping the version is what ends it. A
    // fixed runtime version, or a fingerprint policy, changes both answers and
    // the freeze has to be re-reasoned rather than trusted.
    expect(APP_JSON.expo.runtimeVersion?.policy).toBe("appVersion");
  });
});
