// SERVER-ONLY child-profile CORE (Stage M3) — the client-agnostic heart of
// childUpdateOwnName (lib/auth/childProfileActions), shared by the web action
// (SSR cookie client) and the mobile BFF /profile/name endpoint (bearer
// client). The Supabase client is INJECTED so both surfaces act AS the child:
// the students_write self-row RLS policy (profile_id = current_profile_id())
// and the profiles_update self-row policy apply identically — no service-role
// key anywhere in this flow. Only the name columns are ever written (never
// access/subscription fields). Errors are i18n KEYS, never localized text.
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChildNameCoreResult =
  | { ok: true }
  | {
      ok: false;
      errorKey: "profile.err.nameRequired" | "profile.err.updateFailed";
    };

/**
 * Update the child's OWN first/last name: trim + 80-char caps, both names
 * required, the authoritative students self-row update, then the best-effort
 * profiles.display_name sync (create_child_account seeds it from first+last;
 * other surfaces may read it).
 */
export async function updateChildOwnNameCore(
  client: SupabaseClient,
  profileId: string,
  firstRaw: string,
  lastRaw: string,
): Promise<ChildNameCoreResult> {
  const first = firstRaw.trim().slice(0, 80);
  const last = lastRaw.trim().slice(0, 80);
  if (!first || !last) {
    return { ok: false, errorKey: "profile.err.nameRequired" };
  }

  const { error } = await client
    .from("students")
    .update({ first_name: first, last_name: last })
    .eq("profile_id", profileId);
  if (error) return { ok: false, errorKey: "profile.err.updateFailed" };

  // Best-effort — the students update is the authoritative name and already
  // succeeded.
  await client
    .from("profiles")
    .update({ display_name: `${first} ${last}`.trim() })
    .eq("id", profileId);

  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}
