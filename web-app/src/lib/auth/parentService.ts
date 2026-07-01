"use server";

// Parent auth + child-creation server actions.
// Registration uses the service-role admin client (admin.createUser, no email
// dependency) → setup_parent RPC → sign in for cookies. addChild reuses the
// Stage-8 createChild service, authorizing the current parent first.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getParent, requireParent } from "@/lib/auth/session";
import {
  createChild,
  resetChildPassword as svcResetChildPassword,
} from "@/lib/auth/childAccountService";
import { type ChildInfo } from "@/lib/auth/children";
import { getT } from "@/i18n/server";

export type AuthFormState = { error?: string } | null;

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function registerParent(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const firstName = f(formData, "first_name");
  const lastName = f(formData, "last_name");
  const displayName = `${firstName} ${lastName}`.trim();
  const email = f(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!firstName || !lastName) return { error: t("parent.err.required") };
  if (!email || !email.includes("@")) return { error: t("parent.err.email") };
  if (password.length < 8) return { error: t("parent.err.password") };

  // EMAIL VERIFICATION REQUIRED: use signUp (sends a confirmation email) rather
  // than admin.createUser(email_confirm). When the Supabase project has
  // "Confirm email" enabled, no session is returned until the user confirms.
  const supabase = await createServerSupabase();
  const { data: signUp, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: { account_type: "parent", display_name: displayName },
    },
  });
  if (error || !signUp?.user) {
    // Specific, actionable message when the email is already registered.
    // Supabase returns code "user_already_exists" (newer) or a message that
    // matches /already.*regist|already.*in use|exists/i (older / localized).
    if (
      error &&
      ((error as { code?: string }).code === "user_already_exists" ||
        /already.*regist|already.*in use|exists/i.test(error.message))
    ) {
      return { error: t("parent.err.emailExists") };
    }
    return { error: t("parent.err.createFailed") };
  }

  // Provision the parent role/row now (service role; valid pre-confirmation).
  const admin = getAdminClient();
  await admin.rpc("setup_parent", {
    p_auth_user_id: signUp.user.id,
    p_display_name: displayName || null,
  });

  // Verification disabled on the project → a session exists → straight in.
  if (signUp.session) redirect("/dashboard");
  // Otherwise the user must confirm their email first.
  redirect("/verify-email");
}

export async function parentLogin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const email = f(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t("parent.err.required") };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Keep the unverified-email branch first (a real user who hasn't confirmed).
    if (/confirm/i.test(error.message)) return { error: t("parent.err.unverified") };
    // signInWithPassword returns the SAME generic error for "no such user" and
    // "wrong password". Per the requested UX, disambiguate by checking — with
    // the service-role admin client — whether a parent account with this email
    // exists, so the form can say "no account" vs "wrong password".
    // NOTE: this trades a small account-enumeration signal for clearer UX.
    if (await parentAccountExists(email)) {
      return { error: t("parent.err.wrongPassword") };
    }
    return { error: t("parent.err.noAccount") };
  }
  redirect("/dashboard");
}

// Server-only existence check: does a PARENT account use this email?
// Uses the profiles.email (citext) column populated from auth.users on signup,
// joined to the parents table so synthesized child emails never match. Falls
// back to "exists" on any lookup failure to avoid blocking a legitimate login
// behind a misleading "no account" message.
async function parentAccountExists(email: string): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, parents!inner(profile_id)")
      .eq("email", email)
      .limit(1);
    if (error) return true;
    return (data?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

export async function parentLogout(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}

// ---- Password reset (request link by email → set a new password) ----------
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const email = f(formData, "email").toLowerCase();
  if (!email || !email.includes("@")) return { error: t("parent.err.email") };
  const supabase = await createServerSupabase();
  // Recovery link → /auth/callback exchanges the code → forwards to /reset-password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Never reveal whether the email exists.
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: t("parent.err.password") };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t("parent.err.invalid") };
  redirect("/dashboard");
}

// ---- Account deletion (self-serve; deletes the parent + their children) -----
export async function deleteParentAccount(): Promise<void> {
  const parent = await requireParent();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = getAdminClient();

  // Delete the parent's children (auth users → cascade students/credentials/links).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .eq("created_by_parent_profile_id", parent.profileId);
  const studentIds = (students ?? []).map((s: { profile_id: string }) => s.profile_id);
  if (studentIds.length > 0) {
    const { data: creds } = await admin
      .from("child_credentials")
      .select("auth_user_id")
      .in("student_profile_id", studentIds);
    for (const c of (creds ?? []) as { auth_user_id: string }[]) {
      await admin.auth.admin.deleteUser(c.auth_user_id).catch(() => {});
    }
  }

  // Delete the parent auth user (cascades profile/parents/links).
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {});
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

export type AddChildState =
  // Batch H: the child is created WITHOUT a login ID (allocated on subscribe). On
  // success we return the new studentProfileId so the UI sends the parent to the
  // subscribe/plan step (where the 8-digit ID is revealed).
  | { ok: boolean; studentProfileId?: string; errors?: string[] }
  | null;

export async function addChild(
  _prev: AddChildState,
  formData: FormData,
): Promise<AddChildState> {
  // BUG FIX (D2): authorize WITHOUT redirecting. The old code called
  // requireParent(), which redirect()s to /login whenever the parent lookup
  // fails inside the server action — that throws NEXT_REDIRECT and silently
  // discards the submitted form (the child was never saved, and the parent
  // landed on /login). Resolve the parent via getParent() and, if it cannot be
  // resolved, return an in-form error string so the entered data is preserved
  // and the wizard stays on the Info step.
  const parent = await getParent();
  if (!parent) return { ok: false, errors: ["auth.child.err.createFailed"] };

  const password = String(formData.get("password") ?? "");
  // "Other" city → use the free-text fallback the form sends as city_other.
  const cityChoice = f(formData, "city");
  const city = cityChoice === "__other__" ? f(formData, "city_other") : cityChoice;
  // Structured catalog ids (Batch H / D2 wizard). Empty string → null.
  const districtId = f(formData, "district_id") || null;
  const schoolId = f(formData, "school_id") || null;
  const info: ChildInfo = {
    firstName: f(formData, "first_name"),
    lastName: f(formData, "last_name"),
    city: city || null,
    schoolName: f(formData, "school_name") || null,
    classGrade: f(formData, "class_grade") || null,
    gradeId: f(formData, "grade_id") || null,
    districtId,
    schoolId,
  };
  const result = await createChild({
    parentProfileId: parent.profileId,
    password,
    info,
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  revalidatePath("/dashboard");
  return { ok: true, studentProfileId: result.studentProfileId };
}

// ---- Child management by the parent (reset password / delete) ---------------
export type ChildOpState = { ok?: boolean; error?: string } | null;

export async function resetChildPasswordAction(
  _prev: ChildOpState,
  formData: FormData,
): Promise<ChildOpState> {
  const parent = await requireParent();
  const t = await getT();
  const studentProfileId = f(formData, "student_profile_id");
  const newPassword = String(formData.get("new_password") ?? "");
  const result = await svcResetChildPassword({
    parentProfileId: parent.profileId,
    studentProfileId,
    newPassword,
  });
  if (!result.ok) return { error: t(result.errors[0] ?? "auth.child.err.updateFailed") };
  return { ok: true };
}

export async function deleteChild(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const studentProfileId = f(formData, "student_profile_id");
  if (!studentProfileId) return;
  const admin = getAdminClient();

  // Verify the parent created this child.
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentProfileId)
    .single();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) return;

  // Delete the child auth user (cascades student/credentials/links).
  const { data: cred } = await admin
    .from("child_credentials")
    .select("auth_user_id")
    .eq("student_profile_id", studentProfileId)
    .single();
  if (cred?.auth_user_id) {
    await admin.auth.admin.deleteUser(cred.auth_user_id).catch(() => {});
  }
  revalidatePath("/dashboard");
}
