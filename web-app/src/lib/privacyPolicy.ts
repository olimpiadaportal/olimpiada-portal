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
// THESE ARE NOW THE FALLBACK, NOT THE ANSWER (migration 097, 2026-08-04)
// ----------------------------------------------------------------------
// The eight free-text facts live in `system_settings` under `privacy.*` and are
// edited by an administrator at /settings → Privacy. This literal is what a
// reader renders when the database has not answered: an offline phone, a
// request before the settings row exists, a service-role client that is not
// configured. Keeping a coherent compiled-in answer means those cases show a
// real policy instead of a page full of "to be confirmed".
//
// Resolution order is `resolvePrivacyPolicyStatus()` at the bottom of this file:
// a non-empty admin value wins, otherwise the value here stands.
//
// HOW TO USE IT
//   * Prefer the ADMIN PANEL for corrections. Editing this file is a code change
//     plus an app-store release for the same fact.
//   * An EMPTY string (here or in the settings row) renders a neutral "to be
//     confirmed" chip in the reader's language rather than inventing a fact.
//   * `effectiveDate` empty ⇒ the whole page shows the draft banner and the
//     policy does not present itself as in force. Filling it in is the single
//     switch that turns the page from a draft into a published policy.
//   * Dates are shown VERBATIM, never parsed or reformatted. Write them the way
//     they should appear (e.g. "15.08.2026"); the same string is shown in all
//     three languages, which is why a numeric format is the safe choice.
//   * `pushLive` / `paymentsLive` are DERIVED server-side from the
//     notifications_push flag and the payment mode. They are deliberately not
//     admin-editable: a second free-typed copy of a switch could only ever
//     contradict the switch itself.
//
// IMPORTANT: whenever a DEFAULT here changes, docs/PRIVACY_POLICY.md must be
// updated in the same change — the document and the page are one deliverable
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
  // Set 2026-08-04. These two are now ALSO admin-editable (migration 097); this
  // literal is the fallback a request renders before the settings row is read,
  // and the value an offline phone shows. See resolvePrivacyPolicyStatus below.
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
  // token is unset, so no device token is ever minted. DERIVED at runtime from
  // the notifications_push flag — this literal only covers the offline case.
  pushLive: false,
  // Verified 2026-07-30: no payment provider is integrated and the database
  // refuses every paid write while the payment mode is "off". Also derived.
  paymentsLive: false,
};

/**
 * The admin-editable half, exactly as the database hands it over.
 *
 * Snake_case on purpose: this is the shape BOTH readers already hold — the web
 * app builds it from `system_settings` rows keyed `privacy.<field>`, the mobile
 * app receives it as `get_mobile_config().privacy`. Converting to camelCase in
 * two places would be two chances to typo a field into permanent silence, since
 * a missing key here degrades to the default rather than throwing.
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
 * Merge admin-owned values over the compiled-in defaults.
 *
 * Pure, so both codebases share one definition of "what wins" and the mobile
 * mirror cannot quietly diverge. Two rules, and they differ on purpose:
 *
 *   * STRINGS: only a non-empty value wins. Empty is how the admin panel says
 *     "still to be confirmed", and it must not blank out a default that the
 *     page is already rendering correctly.
 *   * BOOLEANS: any explicit boolean wins, including `false`. These two are
 *     DERIVED server-side from the push flag and the payment mode, so `false`
 *     is a real answer, not an absent one.
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
 * A policy without an effective date is not in force. The page says so plainly
 * rather than presenting an unreviewed draft as a binding document.
 */
export function isPrivacyPolicyDraft(
  status: PrivacyPolicyStatus = PRIVACY_POLICY,
): boolean {
  return status.effectiveDate.trim().length === 0;
}
