"use server";

// R11 — Character-sticker server actions. A child picks a sticker THEME (or
// none) for their pages; this replaces the old wallpaper "background
// templates" feature. The REQUEST-SCOPED client is used on purpose: RLS on
// public.child_sticker_selections only lets the child upsert/delete their OWN
// row, and its WITH CHECK only accepts ENABLED themes — no service role.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export type StickerState = { ok?: boolean; error?: string } | null;

// UUID-shape gate for the client-supplied theme id (R7 input rule); RLS is
// still the real enabled-only/ownership gate behind it.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function selectStickerTheme(
  _prev: StickerState,
  formData: FormData,
): Promise<StickerState> {
  const child = await requireChild();
  const themeId = String(formData.get("theme_id") ?? "").trim();
  const t = await getT();
  if (!UUID_RE.test(themeId)) return { error: t("stk.err.generic") };
  const supabase = await createClient();
  const { error } = await supabase.from("child_sticker_selections").upsert(
    { student_profile_id: child.profileId, theme_id: themeId },
    { onConflict: "student_profile_id" },
  );
  // R7 security: never surface raw Postgres/RLS error text — generic
  // trilingual copy only (a disabled theme lands here too).
  if (error) return { error: t("stk.err.generic") };
  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}

// Turning stickers off = deleting the child's selection row (RLS-owned); the
// decorative layer simply renders nothing when no selection exists.
export async function clearStickerTheme(
  _prev: StickerState,
  _formData: FormData,
): Promise<StickerState> {
  const child = await requireChild();
  const supabase = await createClient();
  const { error } = await supabase
    .from("child_sticker_selections")
    .delete()
    .eq("student_profile_id", child.profileId);
  if (error) {
    const t = await getT();
    return { error: t("stk.err.generic") };
  }
  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}
