"use server";

// Stage 14 — parent buys an olympiad package for a child (one-time, lifetime).
// purchase_olympiad is service-role (computed server-side); the action authorizes
// the parent owns the child first. Real charge is stubbed pending a provider.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireParent } from "@/lib/auth/session";

export async function buyOlympiad(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) return;

  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) return;

  await admin.rpc("purchase_olympiad", {
    p_student_profile_id: studentId,
    p_package_id: packageId,
  });
  revalidatePath(`/children/${studentId}/olympiads`);
}
