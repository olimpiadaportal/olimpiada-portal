"use server";

// Notification preference reads/writes. Preferences live behind two owner-checked
// RPCs (get/set_notification_preferences): a caller may manage their OWN prefs or,
// as a PARENT, a linked child's prefs (the RPC enforces this via
// is_parent_linked_to_student). We call them through the USER-SESSION client so
// RLS + the definer owner-check are the real gate — never the service-role client.
import { createClient } from "@/lib/supabase/server";
import { requireParent } from "@/lib/auth/session";
import { isUuid } from "@/lib/uuid";

export type NotificationChannels = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
};

const DEFAULT_PREFS: NotificationChannels = {
  in_app_enabled: true,
  email_enabled: true,
  push_enabled: true,
};

/** Read prefs for self (profileId omitted/self) or a linked child. Safe default. */
export async function getNotificationPreferences(
  profileId?: string,
): Promise<NotificationChannels> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_notification_preferences", {
      p_profile: profileId ?? null,
    });
    if (error || !data || typeof data !== "object") return DEFAULT_PREFS;
    const d = data as Record<string, unknown>;
    return {
      in_app_enabled: d.in_app_enabled !== false,
      email_enabled: d.email_enabled !== false,
      push_enabled: d.push_enabled !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export type SetPrefsState = { ok: true } | { ok: false; error: string } | null;

/**
 * Update prefs for the parent (target = "self") or one of their children
 * (target = the child's profile id). Guard-first; the child id is validated and
 * ownership is re-enforced by the RPC. Booleans come from checkbox presence.
 */
export async function setNotificationPreferencesAction(
  _prev: SetPrefsState,
  formData: FormData,
): Promise<SetPrefsState> {
  await requireParent();

  const rawTarget = String(formData.get("target") ?? "self");
  let profileId: string | null;
  if (rawTarget === "self") {
    profileId = null;
  } else if (isUuid(rawTarget)) {
    profileId = rawTarget;
  } else {
    return { ok: false, error: "invalid" };
  }

  const inApp = formData.get("in_app") === "on" || formData.get("in_app") === "true";
  const email = formData.get("email") === "on" || formData.get("email") === "true";
  const push = formData.get("push") === "on" || formData.get("push") === "true";

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_notification_preferences", {
      p_profile: profileId,
      p_in_app: inApp,
      p_email: email,
      p_push: push,
    });
    if (error) return { ok: false, error: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
