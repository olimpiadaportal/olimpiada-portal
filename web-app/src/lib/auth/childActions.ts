"use server";

// Child-app server actions: login (8-digit ID + parent password → Stage-8
// childLogin), logout, and practice/olympiad attempt start + grading.
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { childLogin, childLogout } from "@/lib/auth/childLoginService";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { rateLimitAllow } from "@/lib/rateLimit";
import { isUuid } from "@/lib/uuid";

export type ChildLoginState = { error?: string } | null;

export async function childLoginAction(
  _prev: ChildLoginState,
  formData: FormData,
): Promise<ChildLoginState> {
  const t = await getT();

  // M6: per-IP throttle on top of the per-ID DB lockout, so a single source
  // can't spray MANY child IDs cheaply. First hop of x-forwarded-for; "local"
  // when absent (dev). Only a sha256 hash of the IP ever reaches the DB log.
  const hdrs = await headers();
  const ip =
    (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (!rateLimitAllow("childlogin", ip, 20, 15 * 60 * 1000)) {
    return { error: t("auth.child.err.invalidCredentials") };
  }
  const ipHash = createHash("sha256").update(ip).digest("hex");

  const childUniqueId = String(formData.get("child_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const result = await childLogin({ childUniqueId, password, ipHash });
  if (!result.ok) {
    return { error: t(result.errors[0] ?? "auth.child.err.invalidCredentials") };
  }
  redirect("/child");
}

export async function childLogoutAction(): Promise<void> {
  await childLogout();
  // R8 fix: after logout the student lands on the public landing page (was
  // the old standalone child login page, retired in favor of /login).
  redirect("/");
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

// Stage 14 / migration 047 — child starts (or TRUE-resumes) a TIMED olympiad
// attempt on a purchased package. The RPC now returns the test-engine jsonb
// contract {attempt_id, resumed, deadline_at, duration_seconds, count} and the
// attempt runs on the SHARED timed test player (/child/test/run/[attemptId]),
// not the old PracticeRunner path.
export async function startOlympiad(formData: FormData): Promise<void> {
  await requireChild();
  // Module gate (admin Settings → olympiad_module): no new attempts while off.
  if (!(await isFeatureEnabled("olympiad_module"))) redirect("/child");
  const packageId = String(formData.get("package_id") ?? "");
  if (!isUuid(packageId)) redirect("/child/olympiads");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_olympiad_attempt", {
    p_package_id: packageId,
  });
  if (error) {
    // Purchase-only server-side (migration 038): check_violation = no active
    // purchase for this child+package. no_data_found = the package pool has no
    // published questions yet. Raw Postgres text never reaches the client —
    // the olympiads page maps ?err= to trilingual notices.
    if (error.code === "23514") redirect("/child/olympiads?err=noaccess");
    if (error.code === "P0002") redirect("/child/olympiads?err=empty");
    redirect("/child/olympiads?err=1");
  }
  const d = data as { attempt_id?: string; resumed?: boolean } | null;
  if (!d?.attempt_id || !isUuid(String(d.attempt_id))) {
    redirect("/child/olympiads?err=1");
  }
  redirect(`/child/test/run/${d.attempt_id}${d.resumed ? "?resumed=1" : ""}`);
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
  // R7 security: no raw Postgres error text to the client (same generic marker
  // the JSON-parse failure path uses).
  if (error) return { ok: false, error: "bad" };
  const d = data as { score: number; max: number; results: any[] };
  return { ok: true, score: d.score, max: d.max, results: d.results };
}
