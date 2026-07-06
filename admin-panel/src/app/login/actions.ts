"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAllow } from "@/lib/rateLimit";
import { getT } from "@/i18n/server";

export type LoginState = { error?: string } | null;

// M4: fixed-window throttle on the admin login surface — 10 attempts per
// 15 minutes per (client IP + email). Supabase GoTrue adds its own per-IP
// limits underneath; this blunts password spray from the panel itself.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    const t = await getT();
    return { error: t("login.required") };
  }

  // First hop of x-forwarded-for = the client IP as seen by our edge; falls
  // back to "local" in dev. Key is IP+email (low-cardinality, never a secret).
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!rateLimitAllow("admin-login", `${ip}:${email}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    const t = await getT();
    return { error: t("login.tooMany") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // One generic message for every failure — never surface the raw Auth error
    // and never differentiate unconfirmed / nonexistent / wrong-password (no
    // account-enumeration signal from the admin panel).
    const t = await getT();
    return { error: t("login.invalid") };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
