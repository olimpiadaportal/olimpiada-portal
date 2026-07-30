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
// HOW TO USE IT (identical rules to the web file)
//   * Leave a string EMPTY while the answer is not known — the screen renders a
//     neutral "to be confirmed" chip in the reader's language instead of
//     inventing a fact.
//   * `effectiveDate` empty ⇒ the screen shows the draft banner and the policy
//     does not present itself as in force. Filling it in is the single switch
//     that turns the screen from a draft into a published policy, so do it
//     LAST — after a lawyer has reviewed the text (see the Annex in
//     docs/PRIVACY_POLICY.md).
//   * Dates are shown VERBATIM, never parsed or reformatted.
//
// IMPORTANT: whenever one of these values changes, the web file AND
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
  effectiveDate: "",
  lastUpdated: "",
  websiteUrl: "",
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
 * A policy without an effective date is not in force. The screen says so plainly
 * rather than presenting an unreviewed draft as a binding document.
 */
export function isPrivacyPolicyDraft(
  status: PrivacyPolicyStatus = PRIVACY_POLICY,
): boolean {
  return status.effectiveDate.trim().length === 0;
}
