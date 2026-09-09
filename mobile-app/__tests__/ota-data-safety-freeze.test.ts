// A build can be submitted carrying a data type its store declarations deny.
//
// WHAT THIS FILE GUARDED UNTIL 2026-09-09, AND WHY THAT ENDED. It was an OTA
// freeze. `runtimeVersion: {policy: "appVersion"}` is normally read as a safety
// rail — "a bump means a new build, never an OTA" — but while the version does
// NOT move it also makes every change in this repo deliverable over the air onto
// the binary already out. On 1.15.0 that included the optional child `gender`
// field (migration 169), whose data neither store form declared. The version
// moved to 1.16.0, so an update published now carries runtime 1.16.0 and can
// never reach a 1.15.0 binary. That hazard is discharged by its own terms.
//
// THE HAZARD THAT REPLACED IT IS STRICTER, NOT GONE. 1.16.0 CONTAINS the gender
// field, and 1.16.0 is a build the owner is about to submit to BOTH stores.
// Submitting it while Play *Data safety* and App Store *App Privacy* still answer
// that no such data is collected is the same false declaration — made this time
// on a form the reviewer is handed with the build, rather than on one attached to
// a binary already shipped. So the deadline tightened from "do not publish an
// OTA" to "do not submit the build", and the audience widened from one store to
// two.
//
// WHY THE BULLET WAS REWRITTEN RATHER THAN DELETED. The discharged freeze was the
// only place in root `CLAUDE.md` where the gender field, the two consoles and the
// release reflex stood next to each other; deleting it on the "hazard is over"
// reading would have deleted the obligation with it. That is the trap this file
// exists to hold shut, and it is why the retirement condition below is no longer
// a version number — a version bump is what SPENT the old test, and the duty
// outlived it.
//
// WHAT THIS TEST DOES, AND WHAT IT CANNOT DO. It cannot read either store
// console: neither form is generated from this repository, and no submission
// passes through anything here. What it CAN do is keep the obligation standing in
// the two places a person actually meets before submitting — the root `CLAUDE.md`
// release rules, where the reflex to cut a build lives, and
// `scripts/submission-preflight.mjs`, the only mechanical gate anyone runs on
// release day (it reports the check as SKIP, and prints that a skipped check is
// not a pass). It also demands the blocker NAME the version it blocks: a blocker
// left over from a shipped release reads as satisfied and blocks nothing, which
// is exactly how the 1.15.0 wording would have decayed.
//
// HOW IT RETIRES. When the app stops collecting gender, or when BOTH forms list
// it — in that round, delete the `CLAUDE.md` bullet and this file together.
// Bumping the version does NOT retire it any more. The file keeps its old name so
// the references to it in `CLAUDE.md`, `STATUS.md` and `CHANGELOG.md` stay live.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Same source-level idiom as child-gender-optional.test.ts. */
const readApp = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", ...parts), "utf8");
const readRepo = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", "..", ...parts), "utf8");

/** The marker the rule must keep. Short on purpose — a reword should not fail. */
const BLOCKER_MARKER = "GENDER DECLARATION BLOCKER";

const APP_JSON = JSON.parse(readApp("app.json")) as {
  expo: { version: string; runtimeVersion?: { policy?: string } };
};

/**
 * The version that will carry the field into a review queue — i.e. whatever is
 * in `app.json` right now, because `runtimeVersion: appVersion` makes that the
 * next thing submitted. Read rather than pinned: pinning it is what let the old
 * FROZEN_VERSION constant go stale the moment the owner bumped.
 */
const PENDING_VERSION = APP_JSON.expo.version;

/** Normalised: these files' line endings are not this test's business. */
const CLAUDE_MD = readRepo("CLAUDE.md").replace(/\r\n/g, "\n");
const PREFLIGHT = readApp("scripts", "submission-preflight.mjs").replace(
  /\r\n/g,
  "\n",
);

/**
 * Is the field still in the shipping source? `some`, not `every`: either half of
 * the path — the control that asks, or the client that sends — is enough for the
 * next build to collect data the forms do not declare.
 */
const COLLECTS_GENDER = [
  readApp("src", "features", "parent", "ChildInfoForm.tsx"),
  readApp("src", "lib", "api.ts"),
].some((source) => /\bgender\b/.test(source));

describe("the gender field must be declared before the build carrying it is submitted", () => {
  it("keeps the pre-submission blocker in root CLAUDE.md, naming the version it blocks", () => {
    if (!COLLECTS_GENDER) {
      // Spent: nothing collects the field, so no declaration is owed for it.
      expect(COLLECTS_GENDER).toBe(false);
      return;
    }

    expect(CLAUDE_MD).toContain(BLOCKER_MARKER);

    // Exactly this bullet and nothing after it. The release rules are one bullet
    // per line, so the line boundary is the rule boundary — a window measured in
    // characters would let the NEXT bullet satisfy the checks below.
    const start = CLAUDE_MD.indexOf(BLOCKER_MARKER);
    const end = CLAUDE_MD.indexOf("\n", start);
    const bullet = CLAUDE_MD.slice(start, end === -1 ? undefined : end);

    // Name the build it blocks. Without this the wording survives every future
    // bump unchanged and quietly comes to describe a release that already went
    // out — the failure mode the 1.15.0 freeze was one bump away from.
    expect(bullet).toContain(PENDING_VERSION);

    // Name both consoles. One of the two is the half that gets forgotten, and
    // "update the declarations" does not tell anyone which two forms those are.
    expect(bullet).toMatch(/Data safety/i);
    expect(bullet).toMatch(/App Privacy/i);
  });

  it("keeps the same obligation in the release-day preflight", () => {
    if (!COLLECTS_GENDER) {
      expect(COLLECTS_GENDER).toBe(false);
      return;
    }

    // `scripts/submission-preflight.mjs` is the one thing run deliberately before
    // a submission. A rule that lives only in a Markdown file is read when
    // somebody goes looking; this one is printed at the moment of the decision.
    const at = PREFLIGHT.search(/gender/i);
    expect(at).toBeGreaterThan(-1);

    // Exactly the ONE `record(...)` call that mentions gender, and nothing
    // either side of it — the same reason the CLAUDE.md half above slices to a
    // single bullet. A window measured in CHARACTERS does not hold here: the
    // preceding check is a ~1100-character paragraph that already contains the
    // words "App Privacy", so a +/-1500 window let the NEIGHBOUR satisfy the
    // Apple assertion. That is not a hypothetical — it is what this test did
    // until 2026-09-09, which means the Apple half of the obligation was
    // unpinned the whole time and deleting it from the gender check would have
    // gone unnoticed.
    const open = PREFLIGHT.lastIndexOf("record(", at);
    const next = PREFLIGHT.indexOf("record(", at);
    const check = PREFLIGHT.slice(open, next === -1 ? undefined : next);

    // Guard the slice itself. If the file stops being a flat sequence of
    // `record(` calls this silently becomes a window over the whole file again,
    // which is the failure being fixed.
    expect(open).toBeGreaterThan(-1);
    expect(check).toMatch(/gender/i);
    expect(check.length).toBeLessThan(4000);

    // And it must still say what to do about it, not merely mention the word.
    expect(check).toMatch(/Data safety/i);
    expect(check).toMatch(/App Privacy/i);
  });

  it("still rests on runtimeVersion: appVersion", () => {
    if (!COLLECTS_GENDER) {
      expect(COLLECTS_GENDER).toBe(false);
      return;
    }

    // The OTA half of the old freeze was discharged by ONE fact: that a version
    // bump changes the runtime, so an update published for 1.16.0 cannot reach a
    // 1.15.0 install. A fixed runtimeVersion, or a fingerprint policy, makes
    // those binaries reachable again and the freeze has to be re-reasoned rather
    // than assumed spent.
    expect(APP_JSON.expo.runtimeVersion?.policy).toBe("appVersion");
  });
});
