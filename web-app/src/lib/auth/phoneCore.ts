// SERVER-ONLY parent-phone CORE — the client-agnostic heart of updateOwnPhone
// (lib/auth/profileActions), shared by the web action (SSR cookie client) and
// the mobile BFF /profile/phone endpoint (bearer client). The Supabase client
// is INJECTED so both surfaces act AS the parent: the profiles_update self-row
// RLS policy (id = current_profile_id()) applies identically — no service-role
// key writes the row (the service role only appends the audit entry, exactly
// like every other parent-initiated mutation).
//
// profiles.phone is written once at registration (parentService.registerParent)
// and that write is best-effort, so pre-Round-11 accounts and failed patches
// leave it NULL. This core is the self-service repair path: ADD when there is
// none, CHANGE when there is. Clearing back to NULL is deliberately NOT
// supported — the number is mandatory at registration, and filling legacy
// nulls is the whole point of the feature.
//
// Validation is the REGISTRATION rule, imported (never re-spelled) from
// parentValidation, which itself mirrors the DB constraint
// chk_profiles_phone_e164 — so the web form, the mobile app and the database
// can never drift apart. Errors are i18n KEYS, never localized text.
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHONE_MAX, PHONE_RE } from "@/lib/auth/parentValidation";
import { writeAuditLog } from "@/lib/audit";

export type PhoneCoreResult =
  | { ok: true; phone: string }
  | { ok: false; errorKey: "parent.err.phone" | "profile.err.updateFailed" };

/**
 * Strips the separators people naturally type or paste (spaces, dashes,
 * parentheses, dots) so "+994 50 123-45-67" is accepted as the same number the
 * DB constraint wants. Nothing else is rewritten: a value that is not already
 * E.164 must FAIL rather than be guessed into shape.
 */
export function normalizePhoneInput(raw: string): string {
  return String(raw ?? "").replace(/[\s\-().]/g, "");
}

/**
 * Set the parent's own contact phone. `profileId` always comes from the
 * caller's verified session — never from a request body — and the patch is a
 * HARD-CODED single column: profiles_update is row-scoped, not column-scoped,
 * so the patch shape is the only thing stopping this from becoming a generic
 * profile writer. Never build it from client keys.
 */
export async function updateOwnPhoneCore(
  client: SupabaseClient,
  profileId: string,
  rawPhone: string,
): Promise<PhoneCoreResult> {
  const phone = normalizePhoneInput(rawPhone);
  // Length cap BEFORE the pattern, like validateParentRegistration, so an
  // unbounded string is rejected on size rather than on shape.
  if (!phone || phone.length > PHONE_MAX || !PHONE_RE.test(phone)) {
    return { ok: false, errorKey: "parent.err.phone" };
  }

  const { error } = await client
    .from("profiles")
    .update({ phone })
    .eq("id", profileId);
  if (error) {
    // Code only — never the message (leaks internals) and never the number.
    console.error("updateOwnPhone", error.code ?? "unknown_error");
    return { ok: false, errorKey: "profile.err.updateFailed" };
  }

  // The row trigger already audits the full before/after profile; this entry is
  // the parent-facing action record the other self-service mutations write.
  // The number itself stays out of the metadata.
  await writeAuditLog(profileId, "parent.phone_update", {
    targetTable: "profiles",
    targetId: profileId,
  });

  revalidatePath("/profile");
  return { ok: true, phone };
}
