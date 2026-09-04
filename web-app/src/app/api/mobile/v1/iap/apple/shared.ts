// Shared bits of the three parent-facing Apple IAP endpoints.
//
// NOT A ROUTE. Only `route.ts` becomes an endpoint under the app router; this
// file sits beside the three of them because what it holds is route-layer work
// — turning internal refusal codes into trilingual KEYS, and the two sell-side
// gates the purchase endpoint runs before it opens an intent.
//
// WHY THE MAPPING LIVES HERE AND NOT IN THE LIBRARY. `lib/payments/apple/`
// returns internal codes (`bundle_id_mismatch`, `mirrored_grant`, …) that are
// safe to log and must never be returned to a client — the project rule is one
// generic, translated sentence out and the detail in the server log. Keeping
// every code→key decision in ONE table means the three routes cannot disagree
// about what a parent is told, and a new refusal code that nobody mapped falls
// through to the generic key instead of leaking a database word.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { AppleWriteRefusal, AppleRequeryResult } from "@/lib/payments/apple/grantEntitlement";

/** Store product ids are permanent, public and bounded by ck_iap_product_id_shape. */
export const PRODUCT_ID_MAX = 200;

/**
 * Apple's transaction ids are numeric strings today. The 100-character bound is
 * not arbitrary: it is the same one `iap_purchase_intents.original_transaction_id`
 * carries as a CHECK, so an id accepted here is always one the database can
 * store.
 */
export const TRANSACTION_ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * An internal refusal code, as a trilingual key.
 *
 * TWO CODES SHARE ONE KEY ON PURPOSE. `unknown_intent` and `intent_not_yours`
 * both answer `iap.err.notFound`: telling the two apart would turn this endpoint
 * into an oracle for "does this intent id exist", and an intent id is the token
 * that names another family's child.
 */
export function errorKeyForRefusal(reason: AppleWriteRefusal): string {
  switch (reason) {
    case "revoked":
      return "iap.err.revoked";
    case "unknown_product":
      return "iap.err.unavailable";
    case "unknown_intent":
    case "intent_not_yours":
      return "iap.err.notFound";
    case "intent_mismatch":
      return "iap.err.mismatch";
    case "transaction_claimed":
      return "iap.err.alreadyUsed";
    case "child_missing":
      return "iap.err.childGone";
    case "not_configured":
    case "grant_failed":
      return "iap.err.generic";
    default:
      // Every remaining code is a verification failure: the payload did not say
      // what a genuine purchase of one of our products would say. One sentence
      // covers all of them, and the specific code is in the server log.
      return "iap.err.notVerified";
  }
}

/** A re-query failure, as a trilingual key. */
export function errorKeyForRequery(
  reason: Extract<AppleRequeryResult, { ok: false }>["reason"],
): string {
  if (reason === "not_found") return "iap.err.notFound";
  if (reason === "unverified") return "iap.err.notVerified";
  // not_configured / unavailable — ours or Apple's, and worth retrying.
  return "iap.err.generic";
}

/**
 * THE PAYMENT KILL SWITCH, asked of the database rather than of a cached flag.
 *
 * `assert_payments_enabled()` is what every other paid mutation calls first
 * (create_child_subscription, purchase_olympiad, apply_plan_change …). Calling
 * the same function here is what makes this rail CLOSE WITH THE OTHERS: one
 * flip of the `payments` flag stops the web checkout and the store sheet in the
 * same instant, instead of leaving iOS selling through an outage.
 *
 * Returns an i18n key on refusal, or null when payments are open. Fails CLOSED:
 * an unreachable database is not permission to take money.
 */
export async function paymentsClosedKey(): Promise<string | null> {
  if (!isServiceRoleConfigured) return "iap.err.generic";
  try {
    const admin = getAdminClient();
    const { error } = await admin.rpc("assert_payments_enabled");
    if (!error) return null;
    // The RPC raises with a stable HINT precisely so callers can translate
    // without parsing prose. Anything else is an infrastructure fault.
    if ((error.hint ?? "") === "payments_disabled") return "gate.paymentsOff";
    console.error("[apple] the payment gate could not be read:", error.code ?? "unknown");
    return "iap.err.generic";
  } catch {
    return "iap.err.generic";
  }
}

/**
 * May this SUBJECT be sold to THIS child right now?
 *
 * The subject-scope twin of `packageUnsellableKey`'s grade question, and it
 * exists for the same reason: a subject the child's grade does not study
 * delivers NOTHING. The entitlement row is written, and then every child screen
 * filters it straight back out — the arena gate, the Tests home and the daily
 * round all intersect against `subjects_taught_to_grade`, which is how Fizika
 * came to be listed to a grade-3 child in the first place (migration 155). The
 * package branch has refused this since day one; subject scope had no
 * equivalent, so the server would happily take money it could not deliver.
 *
 * THE RULE IS ASKED OF THE DATABASE, never re-written here. Migration 155 exists
 * precisely because this predicate was hand-copied into client files and drifted
 * three separate ways (it ignored topic status, it demanded an exact grade match
 * so a SHARED topic made a subject vanish, and it ran only inside a free-access
 * branch). `subject_taught_to_grade` is the single-subject form the migration
 * added for exactly this case — a server re-check of an id that arrived from a
 * client — so the store and every list the child sees answer from one place.
 *
 * A GRADE-LESS CHILD IS NOT REFUSED. `students.grade_id` is nullable and the
 * rule's own comment is explicit that a NULL grade means NO RESTRICTION rather
 * than an empty catalogue; refusing here would lock such a family out of buying
 * anything at all. The check is skipped rather than asked with a NULL grade,
 * because the RPC would then answer "does this subject have any curriculum
 * anywhere" — a different question, and one whose `false` is not about grades.
 * (This is the one place the two guards deliberately differ: a package with no
 * matching grade row genuinely has nothing to deliver, so that branch refuses.)
 *
 * Returns an i18n key on refusal, or null when the sale may proceed. Fails
 * CLOSED on an unreadable answer, like every other gate on this route: a sale
 * that fails is retried a second later, while a purchase that delivers nothing
 * can only be undone by Apple.
 */
export async function subjectUnsellableKey(
  subjectId: string,
  studentProfileId: string,
): Promise<string | null> {
  if (!isServiceRoleConfigured) return "iap.err.generic";
  const admin = getAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("grade_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (studentError) {
    console.error("[apple] grade lookup failed:", studentError.code ?? "unknown");
    return "iap.err.generic";
  }
  const gradeId = (student as { grade_id?: string | null } | null)?.grade_id ?? null;
  if (!gradeId) return null;

  const { data: taught, error: taughtError } = await admin.rpc("subject_taught_to_grade", {
    p_subject: subjectId,
    p_grade: gradeId,
  });
  if (taughtError) {
    console.error("[apple] the grade rule could not be read:", taughtError.code ?? "unknown");
    return "iap.err.generic";
  }
  // `!== true` and not `=== false`: a null or a shape we did not expect is an
  // unanswered question, and this gate does not guess.
  if (taught !== true) return "iap.err.unavailable";

  return null;
}

/**
 * May this olympiad package be sold to THIS child right now?
 *
 * Two questions, and both of them are about delivering what was paid for:
 *   1. IS IT ON SALE — `olympiad_package_on_sale` is the canonical predicate
 *      (active AND inside the sale window). A delisted package must not be sold
 *      again, even though everyone who already bought one keeps lifetime access.
 *   2. IS IT FOR THIS GRADE — a package targets a set of grades
 *      (`olympiad_package_grades`), and selling one outside that set takes money
 *      for attempts the engine will never serve. The web rail refuses the same
 *      case with `package_not_for_grade`.
 *
 * Returns an i18n key on refusal, or null when the sale may proceed. Fails
 * closed, for the same reason the entitlement probe does.
 */
export async function packageUnsellableKey(
  packageId: string,
  studentProfileId: string,
): Promise<string | null> {
  if (!isServiceRoleConfigured) return "iap.err.generic";
  const admin = getAdminClient();

  const { data: pkg, error: pkgError } = await admin
    .from("olympiad_packages")
    .select("status, sale_starts_at, sale_ends_at")
    .eq("id", packageId)
    .maybeSingle();
  if (pkgError || !pkg) {
    console.error("[apple] package lookup failed:", pkgError?.code ?? "missing");
    return "iap.err.unavailable";
  }
  const row = pkg as { status: string; sale_starts_at: string | null; sale_ends_at: string | null };

  // The three values are read here and JUDGED IN SQL. `olympiad_package_on_sale`
  // is the canonical predicate and its own comment says never to re-inline it —
  // RLS, purchase_olympiad and the public listing all consult that one function,
  // and a fourth copy of "active AND inside the window" written in TypeScript is
  // how the store and the site start disagreeing about what is for sale. The
  // extra round trip buys one rule instead of two.
  const { data: onSale, error: saleError } = await admin.rpc("olympiad_package_on_sale", {
    p_status: row.status,
    p_starts: row.sale_starts_at,
    p_ends: row.sale_ends_at,
  });
  if (saleError) {
    console.error("[apple] the sale window could not be read:", saleError.code ?? "unknown");
    return "iap.err.generic";
  }
  if (onSale !== true) return "iap.err.unavailable";

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("grade_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (studentError) {
    console.error("[apple] grade lookup failed:", studentError.code ?? "unknown");
    return "iap.err.generic";
  }
  const gradeId = (student as { grade_id?: string | null } | null)?.grade_id ?? null;
  if (!gradeId) return "iap.err.unavailable";

  const { data: targeted, error: targetError } = await admin
    .from("olympiad_package_grades")
    .select("grade_id")
    .eq("olympiad_package_id", packageId)
    .eq("grade_id", gradeId)
    .limit(1);
  if (targetError) {
    console.error("[apple] package grade lookup failed:", targetError.code ?? "unknown");
    return "iap.err.generic";
  }
  if (!Array.isArray(targeted) || targeted.length === 0) return "iap.err.unavailable";

  return null;
}
