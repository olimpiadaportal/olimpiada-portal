"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";

export async function revokeChildLinkAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const studentId = String(formData.get("student_id") ?? "");
  const parentId = String(formData.get("parent_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(parentId)) {
    redirect("/accounts");
  }
  const destination = `/accounts/children/${studentId}/access`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke_child_link", {
    p_student: studentId,
    p_parent: parentId,
  });
  const result = data as { ok?: boolean } | null;
  if (error || result?.ok !== true) redirect(`${destination}?error=1`);
  revalidatePath(destination);
  revalidatePath("/accounts");
  redirect(`${destination}?saved=1`);
}
