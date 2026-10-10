"use server";

// Grant a child ONE additional free-trial window (migration 183), after the
// original 24-hour trial has ended. Admin-only on both sides: requireAdmin()
// here, and `is_admin()` inside grant_free_trial_extension, which also enforces
// "only after every window has ended", the configurable extension limit
// (`trial.extension_hours` / `trial.max_extensions` in system_settings) and
// writes the `free_trial.extend` audit row itself.
//
// NEVER A CHARGE. The RPC writes a free_trial_extensions row and 'trial'
// entitlements for the same subjects — no subscription, no checkout.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The RPC's HINT → the page's error code. Unknown → "generic". */
function codeForHint(hint: string | null | undefined): string {
  switch ((hint ?? "").trim()) {
    case "no_trial":
      return "noTrial";
    case "still_active":
      return "stillActive";
    case "extension_limit":
      return "limit";
    case "not_admin":
      return "notAdmin";
    default:
      return "generic";
  }
}

export async function grantTrialExtensionAction(formData: FormData): Promise<void> {
  // Authorize FIRST.
  await requireAdmin();
  const studentId = String(formData.get("student_id") ?? "");
  if (!UUID.test(studentId)) redirect("/accounts");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  const destination = `/accounts/children/${studentId}/access`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_free_trial_extension", {
    p_student: studentId,
    p_note: note || null,
  });
  if (error) {
    console.error("[admin] trial extension refused", error.hint ?? "");
    redirect(`${destination}?trialError=${codeForHint(error.hint)}`);
  }
  revalidatePath(destination);
  redirect(`${destination}?trialSaved=1`);
}
