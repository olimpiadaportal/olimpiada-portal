"use server";

// Parent auth + child-creation server actions.
// Registration uses supabase.auth.signUp (F2): with Supabase "Confirm email"
// OFF (current state) signUp returns a session → immediate login; with it ON
// (requires Auth SMTP) the user is routed to /verify-email until confirmed.
// setup_parent (service-role RPC) provisions the role either way. addChild
// reuses the Stage-8 createChild service, authorizing the current parent first.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getParent, requireParent } from "@/lib/auth/session";
import {
  createChild,
  resetChildPassword as svcResetChildPassword,
} from "@/lib/auth/childAccountService";
import {
  deleteParentAccountCore,
  updateChildProfileCore,
} from "@/lib/auth/parentCore";
import { type ChildInfo } from "@/lib/auth/children";
import {
  EMAIL_MAX,
  EMAIL_RE,
  PASSWORD_MAX,
  validateParentRegistration,
} from "@/lib/auth/parentValidation";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { getT } from "@/i18n/server";
import { rateLimitAllow } from "@/lib/rateLimit";
import { isExistingAccountSignUp } from "@/lib/auth/signUpOutcome";
import { setPendingVerifyEmail } from "@/lib/auth/pendingVerifyEmail";
import {
  classifyAccount,
  loginShouldSayNoAccount,
  mayRegister,
} from "@/lib/auth/accountState";
import {
  allowResendAttempt,
  isMailInfrastructureFailure,
} from "@/lib/auth/resendConfirmationCore";
import { writeAuditLog } from "@/lib/audit";

/**
 * `error` is already-translated text for display. `code` is the MACHINE reason,
 * added so the form can react to a specific failure without string-matching a
 * localized sentence — today: keep Register disabled until the rejected email is
 * actually edited. `rejectedEmail` is echoed back (normalized, lowercased) so
 * that comparison survives the user typing the same address with different case
 * or padding.
 */
export type AuthFormState =
  | {
      error?: string;
      code?: "email_exists";
      rejectedEmail?: string;
      /** Registration succeeded and the account needs email confirmation. */
      verifyEmail?: true;
    }
  | null;

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Registration validation constants + rules live in lib/auth/parentValidation
// (shared with the mobile BFF register endpoint — ONE source of truth).

// R7 security: throttle windows for the parent auth surface (in-memory, see
// lib/rateLimit.ts for the serverless caveat). Child login has its own
// DB-backed lockout; Supabase GoTrue adds per-IP limits underneath.
const WINDOW_15_MIN = 15 * 60_000;

export async function registerParent(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const password = String(formData.get("password") ?? "");
  // Same rules/keys/order as always (required → email → phone → password);
  // the shared validator also normalizes (names trimmed+capped, email
  // lowercased, phone trimmed) — use ITS values from here on.
  const check = validateParentRegistration({
    firstName: f(formData, "first_name"),
    lastName: f(formData, "last_name"),
    email: f(formData, "email"),
    password,
    phone: f(formData, "phone"),
  });
  if (!check.ok) return { error: t(check.errorKey) };
  const { displayName, email, phone } = check;
  if (!rateLimitAllow("register", email, 5, WINDOW_15_MIN)) {
    return { error: t("parent.err.tooMany") };
  }

  // AUTHORITATIVE duplicate check, before any account is created.
  //
  // Reading it off the signUp RESPONSE is not sufficient: GoTrue only obfuscates
  // (empty `identities`) when the existing account is CONFIRMED. If it is
  // UNCONFIRMED it treats the repeat sign-up as a resend and returns a normal
  // user object — indistinguishable from a first registration, which is exactly
  // how duplicates kept getting through during testing.
  //
  // One indexed equality probe on auth.users (migration 099), on a path already
  // limited to 5 attempts per address per 15 minutes.
  const admin = getAdminClient();
  // The SHARED classifier — the same answer login will give for this address.
  // Two separate existence queries are what produced "already registered" on
  // one screen and "no account" on the other.
  const state = await classifyAccount(email);
  if (!mayRegister(state)) {
    return {
      error: t("parent.err.emailExists"),
      code: "email_exists",
      rejectedEmail: email,
    };
  }

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
      return { error: t("parent.err.emailExists"), code: "email_exists", rejectedEmail: email };
    }
    return { error: t("parent.err.createFailed") };
  }
  // …and the case the branch above CANNOT catch. With "Confirm email" enabled,
  // signing up an address that already belongs to a CONFIRMED account is not an
  // error at all: GoTrue returns HTTP 200 with an obfuscated user object and
  // sends no mail, deliberately, so an attacker cannot enumerate accounts.
  //
  // Left unhandled that produced the worst possible outcome — we happily routed
  // the user to "check your inbox" for a mail that would never arrive, with no
  // way to tell that from a slow delivery. The obfuscated object is identifiable
  // by an EMPTY `identities` array, which is the documented marker.
  //
  // Reporting it is a deliberate enumeration trade-off, and consistent with one
  // this project already accepts: parent login distinguishes "no account" from
  // "wrong password" at the owner's request. The mitigation is the same — the
  // rate limiter above (5 attempts per address per 15 minutes).
  if (isExistingAccountSignUp(signUp)) {
    return { error: t("parent.err.emailExists"), code: "email_exists", rejectedEmail: email };
  }

  // Provision the parent role/row now (service role; valid pre-confirmation).
  // `admin` is the client created for the duplicate check above.
  const { data: parentProfileId } = await admin.rpc("setup_parent", {
    p_auth_user_id: signUp.user.id,
    p_display_name: displayName || null,
  });
  if (typeof parentProfileId === "string") {
    await writeAuditLog(parentProfileId, "parent.register");
  }

  // Persist the (already validated) phone on the profile. A failure here must
  // NOT fail registration — the auth user exists; the phone can be backfilled.
  // Log the error code only, never the phone value.
  const { error: phoneError } = await admin
    .from("profiles")
    .update({ phone })
    .eq("auth_user_id", signUp.user.id);
  if (phoneError) {
    console.error(
      "registerParent: failed to persist profile phone",
      phoneError.code ?? "unknown_error",
    );
  }

  // Verification disabled on the project → a session exists → straight in.
  if (signUp.session) redirect("/dashboard");

  // Hand the address to /verify-email so it can resend WITHOUT asking the user
  // to type it again — they just typed it, and asking twice reads like the app
  // forgot. A COOKIE, never a query parameter: an address in the URL lands in
  // browser history, server logs and the Referer header of every asset the page
  // loads, which is exactly the PII leak the `sent=1` flag was designed to
  // avoid. httpOnly, so page scripts cannot read it either.
  await setPendingVerifyEmail(email);

  // RETURN, don't redirect. The form swaps to a "check your inbox" panel in
  // place, and because it never navigated it still holds the address the user
  // typed — so the resend needs no cookie, no query parameter and no second
  // round of typing. This is also exactly what the mobile register screen does,
  // so the two flows now match.
  //
  // The cookie above stays as a SECONDARY path: it is what lets the standalone
  // /verify-email route (reached from a bookmark or the login screen's
  // "confirm your email" error) know the address within the same session. If it
  // fails to survive for any reason, the panel is unaffected.
  return { verifyEmail: true };
}

export async function parentLogin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getT();
  const email = f(formData, "email").toLowerCase().slice(0, EMAIL_MAX);
  const password = String(formData.get("password") ?? "").slice(0, PASSWORD_MAX);
  if (!email || !password) return { error: t("parent.err.required") };
  // Throttle BEFORE any credential/existence work: the "no account" vs "wrong
  // password" UX (owner-requested) is an enumeration signal, so bulk probing
  // must hit this wall. 10 attempts / 15 min per email.
  if (!rateLimitAllow("login", email, 10, WINDOW_15_MIN)) {
    return { error: t("parent.err.tooMany") };
  }
  const supabase = await createServerSupabase();
  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // Keep the unverified-email branch first (a real user who hasn't confirmed).
    if (/confirm/i.test(error.message)) return { error: t("parent.err.unverified") };
    // signInWithPassword returns the SAME generic error for "no such user" and
    // "wrong password". Per the requested UX, disambiguate — but through the
    // SHARED classifier, so this can never disagree with what registration
    // told the same person about the same address.
    // NOTE: this trades a small account-enumeration signal for clearer UX.
    const state = await classifyAccount(email);
    if (loginShouldSayNoAccount(state)) return { error: t("parent.err.noAccount") };
    return { error: t("parent.err.wrongPassword") };
  }

  // ---- Self-heal an incomplete account -------------------------------------
  //
  // The password was correct, so this really is the account's owner. If the
  // parent rows are missing (a signUp that never reached setup_parent, or a
  // profile reconstructed by disaster recovery), finish the provisioning now
  // instead of sending them to /dashboard, where requireParent would bounce
  // them straight back to /login with no message at all — an endless loop that
  // looked like "login does nothing".
  //
  // Only AFTER authentication: this writes rows, so it must never run for
  // someone who merely typed an address. setup_parent itself refuses staff and
  // student profiles (migration 105), so an administrator signing in here can
  // never acquire a parent account.
  const authUserId = signIn?.user?.id;
  if (authUserId) {
    const state = await classifyAccount(email);
    if (state === "incomplete" && isServiceRoleConfigured) {
      const { error: healErr } = await getAdminClient().rpc("setup_parent", {
        p_auth_user_id: authUserId,
        p_display_name: null,
      });
      if (healErr) {
        // Do not strand them on a blank redirect loop — say something true.
        console.error("parentLogin: self-heal failed", healErr.code ?? "unknown");
        return { error: t("parent.err.incompleteAccount") };
      }
    } else if (state === "staff") {
      // A staff address is not a parent account. Without this they would sign
      // in successfully and then bounce off requireParent forever.
      return { error: t("parent.err.staffAccount") };
    }
  }

  redirect("/dashboard");
}

// Server-only existence check: does a PARENT account use this email?
// Uses the profiles.email (citext) column populated from auth.users on signup,
// joined to the parents table so synthesized child emails never match. Falls
// back to "exists" on any lookup failure to avoid blocking a legitimate login
// behind a misleading "no account" message.

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
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { error: t("parent.err.email") };
  }
  if (!rateLimitAllow("pwreset", email, 3, WINDOW_15_MIN)) {
    return { error: t("parent.err.tooMany") };
  }
  const supabase = await createServerSupabase();
  // Recovery link → /auth/callback exchanges the code → forwards to /reset-password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Never reveal whether the email exists.
  redirect("/forgot-password?sent=1");
}

// ---- Resend the SIGNUP confirmation email ---------------------------------
// The only self-service escape hatch now that "Confirm email" is ON: an
// unconfirmed parent cannot log in, and a password reset does NOT confirm an
// address — so a lost/filtered first mail would otherwise strand the account
// permanently. Adds nothing to the auth model: no session, no privilege, no
// service-role client (auth.resend is an anon-callable operation).
//
// Unlike requestPasswordReset this does NOT redirect: the whole point is a
// visible success / pending / throttled state on the page, so it returns state.
//
// ENUMERATION: unknown address, already-confirmed address and a per-address
// GoTrue rejection all answer the identical { ok: true }. Only two things are
// reported honestly — a malformed address (the sender's own typo), and a
// failure of OUR mail rail (address-independent, see isMailInfrastructureFailure).
// Known residual: response LATENCY still differs, because a real send waits on
// SMTP while a short-circuit returns immediately. Not padded here — /login
// already discloses account existence by explicit owner decision, so the extra
// signal ("is it confirmed yet") is marginal against a real cost to everyone's
// UX. Do not read the neutral answer as a timing guarantee.
// `throttled` is a UI hint, not an outcome: it lets the form hold its button
// for the cooldown instead of letting a frustrated user hammer a request that
// is already being refused. It says nothing about the ADDRESS (every bucket
// reports identically), so it is not an enumeration signal.
export type ResendConfirmationState =
  | { ok?: boolean; error?: string; throttled?: boolean }
  | null;

export async function resendConfirmationEmail(
  _prev: ResendConfirmationState,
  formData: FormData,
): Promise<ResendConfirmationState> {
  const t = await getT();
  const email = f(formData, "email").toLowerCase();
  // A malformed address is the sender's own typo — rejecting it reveals
  // nothing about which accounts exist.
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { error: t("parent.err.email") };
  }
  // Three shared buckets (per address / per source / global) — see
  // lib/auth/resendConfirmationCore for the sizes and the reasoning. The mobile
  // BFF route calls this SAME function, so web and mobile really do share one
  // budget and a caller cannot double it by switching surface.
  if (!allowResendAttempt(email, await headers())) {
    return { error: t("parent.err.tooMany"), throttled: true };
  }

  try {
    // ANON/SSR client on purpose — resend is NOT privileged and must never
    // touch the service-role client. Same emailRedirectTo as registerParent so
    // the link lands on the working /auth/callback exchange.
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) {
      // Log the CODE only — never the address, never the message.
      console.error(
        "resendConfirmationEmail: resend rejected",
        (error as { code?: string }).code ?? "unknown_error",
      );
      // Branch ONLY on address-INDEPENDENT failures (mail rail down / quota
      // gone): those happen the same for every address, so reporting them
      // leaks nothing, and hiding them would show a green "sent" while nothing
      // could possibly arrive. Everything else — unknown address, already
      // confirmed, asked again inside GoTrue's per-address interval — stays
      // swallowed behind the neutral answer, or the form becomes an
      // account-enumeration oracle.
      if (isMailInfrastructureFailure(error)) {
        return { error: t("verify.resendFailed") };
      }
    }
  } catch {
    // supabase-js only throws non-AuthError values, so this is a last-resort
    // net (the classified faults above return through the normal path).
    return { error: t("verify.resendFailed") };
  }
  return { ok: true };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // L1: PARENT-only — children change their password through
  // childChangeOwnPassword, so a child (or any non-parent) session must never
  // reach auth.updateUser here. getParent (not requireParent) so a failed
  // lookup returns an in-form generic error instead of a redirect that would
  // discard the submission.
  const parent = await getParent();
  const t = await getT();
  if (!parent) return { error: t("parent.err.invalid") };
  // L1: throttle per profile — password updates are credential-adjacent.
  if (!rateLimitAllow("pwupdate", parent.profileId, 5, WINDOW_15_MIN)) {
    return { error: t("parent.err.tooMany") };
  }
  const password = String(formData.get("password") ?? "");
  // L1: same RULE as registration — bounds (>128 rejected, never silently
  // truncated) plus strength. A recovery link that let the account out of the
  // policy would make the policy optional for anyone who clicks "forgot".
  // parentLogin above deliberately does NOT run this: existing passwords
  // predate the rule and must keep signing in.
  const weak = checkNewPassword(password);
  if (weak) {
    return {
      error: t(
        weak === "tooShort" || weak === "tooLong"
          ? "parent.err.password"
          : "parent.err.passwordWeak",
      ),
    };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t("parent.err.invalid") };
  redirect("/dashboard");
}

// ---- Account deletion (self-serve; deletes the parent + their children) -----
// Stage M2: the deletion cascade (children auth users → parent auth user) lives
// in lib/auth/parentCore.deleteParentAccountCore, shared with the mobile BFF.
export async function deleteParentAccount(): Promise<void> {
  const parent = await requireParent();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await deleteParentAccountCore({
    parentProfileId: parent.profileId,
    authUserId: user?.id ?? null,
  });
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
  // NAMING: district_id = the CITY (historic naming); city_district_id = the
  // real intra-city rayon (Round 21).
  const districtId = f(formData, "district_id") || null;
  const cityDistrictId = f(formData, "city_district_id") || null;
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
    cityDistrictId,
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

// ---- Parent edits a child's profile info AFTER creation --------------------
// Internal identifiers (child_unique_id, profile/DB ids) are NEVER editable
// here — only the human-facing info a parent may correct. Stage M2: ownership
// re-verification, field normalization/caps and validateChildInfo live in
// lib/auth/parentCore.updateChildProfileCore, shared with the mobile BFF.
export type UpdateChildState =
  | { ok?: boolean; error?: string; errors?: string[] }
  | null;

export async function updateChildProfile(
  _prev: UpdateChildState,
  formData: FormData,
): Promise<UpdateChildState> {
  // Authorize FIRST. getParent (not requireParent) so a lookup miss returns an
  // in-form error and preserves the submission instead of redirecting.
  const parent = await getParent();
  const t = await getT();
  if (!parent) return { error: t("childedit.err.generic") };

  const res = await updateChildProfileCore({
    parentProfileId: parent.profileId,
    studentProfileId: f(formData, "student_profile_id"),
    firstName: f(formData, "first_name"),
    lastName: f(formData, "last_name"),
    districtId: f(formData, "district_id"),
    cityDistrictId: f(formData, "city_district_id"),
    schoolId: f(formData, "school_id"),
    gradeId: f(formData, "grade_id"),
    schoolName: f(formData, "school_name"),
    classGrade: f(formData, "class_grade"),
    city: f(formData, "city"),
  });
  if (!res.ok) {
    // Validation keys are returned RAW (the edit form localizes them);
    // generic/ownership errors are localized here — historical behavior.
    if ("validationErrors" in res) return { errors: res.validationErrors };
    return { error: t(res.errorKey) };
  }
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
