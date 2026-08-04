// Privacy-policy FACTS THAT THE CODE CANNOT KNOW — the mobile mirror of
// web-app/src/lib/privacyPolicy.ts.
//
// THE WEB FILE IS THE SOURCE OF TRUTH. This file exists because the mobile app
// is a separate bundle and cannot import from web-app/; the policy BODY is
// shared properly (the `privacy.*` keys are synced by scripts/sync-i18n.mjs),
// but these ten values are build-time constants, not catalog strings.
//
// ANTI-DRIFT: __tests__/privacy-policy-status.test.ts reads the web file and
// fails if the two ever disagree. So the workflow is: edit the WEB file, run
// the mobile tests, copy the value across when they complain. Never let the two
// answer the same question differently — a parent reading the policy on the
// phone and on the site must be told the same effective date, the same hosting
// region and the same retention periods.
//
// THESE ARE NOW THE FALLBACK, NOT THE ANSWER (migration 097, 2026-08-04)
// ----------------------------------------------------------------------
// The eight free-text facts are admin-owned in `system_settings` and reach this
// app inside `get_mobile_config().privacy`. This literal is what the screen
// renders when the config has not arrived — first paint, no network, a device
// that has never been online. That matters more on a phone than on the web: the
// privacy screen must be reachable SIGNED OUT and OFFLINE for both roles
// (Apple 5.1.4(b)), and a page of "to be confirmed" chips is a bad answer to a
// reviewer who opened it in aeroplane mode.
//
// Resolution is `resolvePrivacyPolicyStatus()` — the same pure merge as the web
// file, mirrored so both codebases agree on what wins.
//
// HOW TO USE IT (identical rules to the web file)
//   * Prefer the ADMIN PANEL for corrections — editing this file means a new
//     binary, and an OTA update only reaches builds on the same runtime version.
//   * An EMPTY string renders a neutral "to be confirmed" chip in the reader's
//     language rather than inventing a fact.
//   * `effectiveDate` empty ⇒ the screen shows the draft banner and the policy
//     does not present itself as in force.
//   * Dates are shown VERBATIM, never parsed or reformatted.
//   * `pushLive` / `paymentsLive` are DERIVED server-side from the
//     notifications_push flag and the payment mode — never admin-typed.
//
// IMPORTANT: whenever a DEFAULT here changes, the web file AND
// docs/PRIVACY_POLICY.md must be updated in the same change — the document, the
// page and this screen are one deliverable.
export type PrivacyPolicyStatus = {
  /** Day the policy takes effect, as it should be displayed. Empty = draft. */
  effectiveDate: string;
  /** Day of the last substantive edit, as it should be displayed. */
  lastUpdated: string;
  /** Public address of the published policy/site, e.g. "olympiq.ai". */
  websiteUrl: string;
  /** Mailbox for privacy / data-subject / deletion requests. Falls back to the
   *  admin-configured support email when empty. */
  privacyEmail: string;
  /** Where the database and the web deployment physically live. NOT knowable
   *  from the repo — the owner must read it from the two dashboards. */
  hostingRegion: string;
  /** How long the hosting providers keep server request logs (which contain IP
   *  addresses). A platform-plan setting, not something our code controls. */
  serverLogRetention: string;
  /** Retention for learning data, audit entries and sign-in attempt logs while
   *  an account is open. Today the code imposes NONE — the only automatic purge
   *  anywhere is read notifications at 180 days. */
  learningDataRetention: string;
  /** Database backup / point-in-time-recovery retention. Deletion removes live
   *  rows; backups are outside our code's control. */
  backupRetention: string;
  /** True once push notifications actually deliver. While false, Expo relays
   *  nothing and Apple APNs / Google FCM receive nothing at all. */
  pushLive: boolean;
  /** True once a payment provider is integrated AND payments are switched on.
   *  While false the policy describes payments in the future tense. */
  paymentsLive: boolean;
};

export const PRIVACY_POLICY: PrivacyPolicyStatus = {
  // Set 2026-08-04. Also admin-editable (migration 097); this literal is the
  // offline/first-paint fallback. See resolvePrivacyPolicyStatus below.
  effectiveDate: "04.08.2026",
  lastUpdated: "04.08.2026",
  // Registered 2026-07-30 (Namecheap). The apex serves the site; www redirects
  // to it at the host level, so the canonical form carries no "www".
  websiteUrl: "olympiq.ai",
  privacyEmail: "",
  hostingRegion: "",
  serverLogRetention: "",
  learningDataRetention: "",
  backupRetention: "",
  // Verified 2026-07-30: the server-side push flag is off and the Expo access
  // token is unset, so no device token is ever minted.
  pushLive: false,
  // Verified 2026-07-30: no payment provider is integrated and the database
  // refuses every paid write while the payment mode is "off".
  paymentsLive: false,
};

/**
 * The admin-editable half, exactly as `get_mobile_config().privacy` hands it
 * over. Snake_case on purpose — see the web file for the reasoning.
 */
export type PrivacyPolicyOverrides = {
  effective_date?: string | null;
  last_updated?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  hosting_region?: string | null;
  server_log_retention?: string | null;
  learning_data_retention?: string | null;
  backup_retention?: string | null;
  push_live?: boolean | null;
  payments_live?: boolean | null;
};

/** A blank/whitespace override means "not yet known" — keep the default. */
function pick(override: string | null | undefined, fallback: string): string {
  const v = typeof override === "string" ? override.trim() : "";
  return v.length > 0 ? v : fallback;
}

/**
 * Merge admin-owned values over the compiled-in defaults. Mirror of the web
 * function; the two must stay identical.
 *
 *   * STRINGS: only a non-empty value wins — empty is "still to be confirmed"
 *     and must not blank out a default the screen already renders correctly.
 *   * BOOLEANS: any explicit boolean wins, including `false`, because these two
 *     are derived server-side and `false` is a real answer, not an absent one.
 */
export function resolvePrivacyPolicyStatus(
  overrides?: PrivacyPolicyOverrides | null,
  defaults: PrivacyPolicyStatus = PRIVACY_POLICY,
): PrivacyPolicyStatus {
  if (!overrides) return defaults;
  return {
    effectiveDate: pick(overrides.effective_date, defaults.effectiveDate),
    lastUpdated: pick(overrides.last_updated, defaults.lastUpdated),
    websiteUrl: pick(overrides.website_url, defaults.websiteUrl),
    privacyEmail: pick(overrides.contact_email, defaults.privacyEmail),
    hostingRegion: pick(overrides.hosting_region, defaults.hostingRegion),
    serverLogRetention: pick(
      overrides.server_log_retention,
      defaults.serverLogRetention,
    ),
    learningDataRetention: pick(
      overrides.learning_data_retention,
      defaults.learningDataRetention,
    ),
    backupRetention: pick(overrides.backup_retention, defaults.backupRetention),
    pushLive:
      typeof overrides.push_live === "boolean"
        ? overrides.push_live
        : defaults.pushLive,
    paymentsLive:
      typeof overrides.payments_live === "boolean"
        ? overrides.payments_live
        : defaults.paymentsLive,
  };
}

/**
 * A policy without an effective date is not in force. The screen says so plainly
 * rather than presenting an unreviewed draft as a binding document.
 */
export function isPrivacyPolicyDraft(
  status: PrivacyPolicyStatus = PRIVACY_POLICY,
): boolean {
  return status.effectiveDate.trim().length === 0;
}
