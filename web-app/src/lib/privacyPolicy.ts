// Privacy-policy FACTS THAT THE CODE CANNOT KNOW.
//
// The policy body itself lives in the i18n catalog (`privacy.*` in
// src/i18n/messages.ts) and in docs/PRIVACY_POLICY.md. Everything in THIS file
// is a value that no amount of reading the repository can establish — a hosting
// region, a retention period, the day the document takes effect — plus two
// switches whose truth changes the moment a server flag is flipped.
//
// WHY THEY ARE HERE AND NOT IN THE TEXT
// -------------------------------------
// The source document carries them as inline `[OWNER MUST CONFIRM: …]`
// placeholders. A published page must never show a literal placeholder, and
// the same unknown appears in all three languages — so an owner filling one in
// would have to edit az, en AND ru and could silently miss one. Collecting them
// here means each unknown is answered ONCE, in one place, and the page updates
// in every language at the same instant.
//
// HOW TO USE IT
//   * Leave a string EMPTY while the answer is not known — the page renders a
//     neutral "to be confirmed" chip in the reader's language instead of
//     inventing a fact.
//   * `effectiveDate` empty ⇒ the whole page shows the draft banner and the
//     policy does not present itself as in force. Filling it in is the single
//     switch that turns the page from a draft into a published policy, so do it
//     LAST — after a lawyer has reviewed the text (see the Annex in
//     docs/PRIVACY_POLICY.md).
//   * Dates are shown VERBATIM, never parsed or reformatted. Write them the way
//     they should appear (e.g. "15.08.2026"); the same string is shown in all
//     three languages, which is why a numeric format is the safe choice.
//
// IMPORTANT: whenever one of these values changes, docs/PRIVACY_POLICY.md must
// be updated in the same change — the document and the page are one deliverable
// (the store listings link to the page, Apple and Google read the document).
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
   *  from the repo (no vercel.json, no supabase config; a project ref does not
   *  encode a region) — the owner must read it from the two dashboards. */
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
 * A policy without an effective date is not in force. The page says so plainly
 * rather than presenting an unreviewed draft as a binding document.
 */
export function isPrivacyPolicyDraft(
  status: PrivacyPolicyStatus = PRIVACY_POLICY,
): boolean {
  return status.effectiveDate.trim().length === 0;
}
