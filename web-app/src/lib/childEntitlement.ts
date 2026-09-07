// "Has this child been GRANTED anything?" — the provider-agnostic half of the
// dashboard access pill (see lib/accessPill for why the pill needs more than
// `students.access_status`).
//
// child_entitled_subjects(uuid) (migration 168) is SECURITY DEFINER, granted to
// `authenticated`, and restates the entitlements reader set itself — the child,
// a linked parent, the parent who created them, an admin — so a parent can only
// ever ask about their OWN child. It answers what the family HOLDS: an Apple
// purchase, the web rail, a manual comp, a school licence. It deliberately
// excludes `source = 'trial'` and never consults the giveaway or an admin
// free-access window, because borrowed access is not ownership; the trial has
// its own reader in lib/freeTrial.
//
// NOT my_accessible_subjects(), which is scoped to current_profile_id() — on a
// parent screen that is the PARENT, i.e. the wrong person entirely.
import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Whether a SPECIFIC child holds at least one live subject entitlement. Safe
 * fallback = false, which is the pill's fail-open direction: a hiccup shows
 * yesterday's label and never invents access. NOT request-cached (the arg
 * varies per child).
 */
export async function isChildEntitled(studentId: string): Promise<boolean> {
  if (!studentId) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("child_entitled_subjects", {
      p_student: studentId,
    });
    if (error || !Array.isArray(data)) return false;
    // A jsonb array of { id, code, name }. Rows are checked rather than counted:
    // a malformed one must not be reported to a parent as access.
    return (data as Record<string, unknown>[]).some(
      (row) => typeof row?.id === "string" && row.id !== "",
    );
  } catch {
    return false;
  }
}
