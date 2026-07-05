// Per-parent / per-child scheduled FREE-ACCESS intervals (Round 12). Admins create
// windows in `free_access_intervals`; while one is active the parent's subscription
// content is FREE and the child can practice/olympiad free. Reads go through the
// SECURITY DEFINER RPCs (the table is admin-only under RLS), scoped to the current
// session's identity, so a parent can only see their OWN status.
//
// This is DISTINCT from the global giveaway (getPaymentModeInfo) and from the
// permanent admin_grant comped subscription — it mirrors the giveaway OVERRIDE
// model (lazy expiry, nothing to unwind).
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ParentFreeAccess = { active: boolean; endsAt: string | null };

/**
 * The CURRENT parent's free-access status (max active window over the parent +
 * their children). `endsAt` powers the parent-page countdown. Cached per request.
 * Safe fallback = inactive so a hiccup never opens free access by accident.
 */
export const getParentFreeAccess = cache(async (): Promise<ParentFreeAccess> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("current_parent_free_access");
    if (error || !data || typeof data !== "object") return { active: false, endsAt: null };
    const d = data as { active?: boolean; ends_at?: string | null };
    return { active: d.active === true, endsAt: d.ends_at ?? null };
  } catch {
    return { active: false, endsAt: null };
  }
});

/**
 * The CURRENT child's free-access flag (child dashboard gate). Cached per request.
 */
export const getChildFreeAccessActive = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_free_access_active");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
});

/**
 * Whether a SPECIFIC child (by student profile id) currently has free access —
 * scoped server-side to the caller's OWN child. Used by the parent subscription
 * gate + display so a per-child window never blocks an uncovered sibling. Safe
 * fallback = false. NOT request-cached (the arg varies per child).
 */
export async function isChildFreeAccessActive(studentId: string): Promise<boolean> {
  if (!studentId) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_child_free_access_active", {
      p_student: studentId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
