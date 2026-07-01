"use server";

// Child-app server actions: login (8-digit ID + parent password → Stage-8
// childLogin), logout, and wallpaper selection (child manages own; RLS-gated).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { childLogin, childLogout } from "@/lib/auth/childLoginService";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export type ChildLoginState = { error?: string } | null;

export async function childLoginAction(
  _prev: ChildLoginState,
  formData: FormData,
): Promise<ChildLoginState> {
  const t = await getT();
  const childUniqueId = String(formData.get("child_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const result = await childLogin({ childUniqueId, password });
  if (!result.ok) {
    return { error: t(result.errors[0] ?? "auth.child.err.invalidCredentials") };
  }
  redirect("/child");
}

export async function childLogoutAction(): Promise<void> {
  await childLogout();
  redirect("/child-login");
}

export async function selectWallpaper(formData: FormData): Promise<void> {
  const child = await requireChild();
  const wallpaperId = String(formData.get("wallpaper_id") ?? "");
  if (!wallpaperId) return;
  const supabase = await createClient();
  await supabase
    .from("child_wallpaper_selections")
    .upsert(
      { student_profile_id: child.profileId, wallpaper_id: wallpaperId },
      { onConflict: "student_profile_id" },
    );
  revalidatePath("/child");
}

// Stage 13 — start a random 25-question practice attempt (server picks the
// questions; difficulty is never chosen). The student RPC is owner-checked.
export async function startPractice(formData: FormData): Promise<void> {
  await requireChild();
  const subjectId = String(formData.get("subject_id") ?? "");
  if (!subjectId) redirect("/child");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_practice_attempt", {
    p_subject_id: subjectId,
    p_count: 25,
  });
  if (error || !data) redirect("/child?practice=empty");
  redirect(`/child/practice/${data}`);
}

// Stage 14 — child starts an olympiad attempt from a purchased package's pool.
export async function startOlympiad(formData: FormData): Promise<void> {
  await requireChild();
  const packageId = String(formData.get("package_id") ?? "");
  if (!packageId) redirect("/child/olympiads");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_olympiad_attempt", {
    p_package_id: packageId,
  });
  if (error || !data) redirect("/child/olympiads?err=1");
  redirect(`/child/practice/${data}`);
}

export type GradeState =
  | {
      ok: boolean;
      score?: number;
      max?: number;
      results?: { question_id: string; is_correct: boolean }[];
      error?: string;
    }
  | null;

export async function gradePractice(
  _prev: GradeState,
  formData: FormData,
): Promise<GradeState> {
  await requireChild();
  const attemptId = String(formData.get("attempt_id") ?? "");
  let answers: unknown = [];
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "[]"));
  } catch {
    return { ok: false, error: "bad" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grade_practice_attempt", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) return { ok: false, error: error.message };
  const d = data as { score: number; max: number; results: any[] };
  return { ok: true, score: d.score, max: d.max, results: d.results };
}
