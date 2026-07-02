"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

export type LoginState = { error?: string } | null;

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
