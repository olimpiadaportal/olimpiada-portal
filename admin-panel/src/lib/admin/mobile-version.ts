// Pure rules for the mobile version gate, shared by the server action
// (authoritative) and by MobileVersionForm (immediate feedback before submit).
//
// WHY THIS IS ITS OWN MODULE AND NOT PART OF mobileApp.ts: that file carries
// "use server", where every export must be an async server action. A sync
// helper cannot live there, and the client form could not call it if it did —
// it would only get an action reference back. Keeping the rules here is also
// what stops the two halves drifting: the form and the action evaluate the
// SAME function, so a rule can never be enforced in one and forgotten in the
// other.

/** Exactly three numeric segments — mirrors the DB CHECK on min/latest_version. */
export const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function isSemver(value: string): boolean {
  return SEMVER_RE.test(value);
}

function parts(version: string): [number, number, number] {
  const raw = version.split(".");
  const num = (i: number) => {
    const n = Number.parseInt(raw[i] ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  };
  return [num(0), num(1), num(2)];
}

/**
 * NUMERIC semver comparison: -1 if a < b, 0 if equal, 1 if a > b.
 *
 * NEVER compare these versions as strings. Lexicographically "1.10.0" sorts
 * BELOW "1.9.0", so a string compare is correct for every version this project
 * has ever shipped and starts lying at exactly 1.10 — the first release where a
 * segment reaches two digits. The mobile side already learned this (its
 * compareSemver is numeric and has a 1.2.0 < 1.10.0 test); this is the same
 * rule on the admin side. Do not "simplify" it back to a < b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export type VersionGateInput = {
  minVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  storeUrl: string;
};

/** i18n error code for a configuration that would strand users, or null. */
export type VersionGateProblem =
  | "mobileapp.err.forceNoUrl"
  | "mobileapp.err.minAboveLatest"
  | null;

/**
 * The two safety rails. Both describe states the app CANNOT recover from on the
 * device, which is why they are refused rather than warned about:
 *
 *   1. force_update with an empty store_url renders a full-screen blocking gate
 *      with no button, no back gesture and no navigator behind it. The user has
 *      literally no way out of the app.
 *   2. min_version above latest_version asks every install to update to a
 *      version that, by the panel's own record, does not exist.
 */
export function versionGateProblem(v: VersionGateInput): VersionGateProblem {
  if (v.forceUpdate && v.storeUrl.trim() === "") {
    return "mobileapp.err.forceNoUrl";
  }
  // Only meaningful once both fields are well-formed; the semver check owns
  // malformed input and reports it with its own message.
  if (
    isSemver(v.minVersion) &&
    isSemver(v.latestVersion) &&
    compareVersions(v.minVersion, v.latestVersion) > 0
  ) {
    return "mobileapp.err.minAboveLatest";
  }
  return null;
}
