// Palette bridge between the student profile (which WRITES students.palette)
// and the arena chrome hook (features/arena/useArena → useStudentSelf, which
// READS it). The read side delegates to the arena self query so there is ONE
// cache: a successful save patches that cache in place and the whole student
// shell re-skins live, no refetch needed.
//
// Write semantics = web selectPalette (childProfileActions.ts): a self-row
// UPDATE of public.students.palette through the child's OWN JWT (students_write
// RLS allows profile_id = current_profile); only a whitelisted slug or NULL
// (default) ever reaches the column — mirroring the students.palette CHECK.
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";
import { QK, useStudentSelf, type StudentSelf } from "@/features/arena/queries";
import type { ArenaPalette } from "@/theme/tokens";

/** The 5 saveable slugs (students.palette CHECK); "default" is stored as NULL. */
const PALETTE_SLUGS = new Set(["sky", "bubblegum", "mint", "sunset", "rainbow"]);

export function normalizePalette(raw: unknown): ArenaPalette {
  return typeof raw === "string" && PALETTE_SLUGS.has(raw) ? (raw as ArenaPalette) : "default";
}

/** The resolved arena palette ("default" until the student row loads). */
export function useArenaPalette(): ArenaPalette {
  return useStudentSelf().data?.palette ?? "default";
}

/**
 * Save (or clear) the palette on the child's own JWT and patch the shared
 * arena self cache so the chrome re-skins immediately. Returns false on
 * failure (callers show the generic trilingual update error).
 */
export function useSetStudentPalette() {
  const profileId = useAuthStore((s) => s.profileId);
  const queryClient = useQueryClient();
  return async (palette: ArenaPalette): Promise<boolean> => {
    if (!profileId) return false;
    const value = PALETTE_SLUGS.has(palette) ? palette : null; // "default" → NULL
    const { error } = await supabase
      .from("students")
      .update({ palette: value })
      .eq("profile_id", profileId);
    if (error) return false;
    const next = normalizePalette(value);
    queryClient.setQueryData<StudentSelf>(QK.self(profileId), (prev) =>
      prev ? { ...prev, palette: next } : prev,
    );
    // Not loaded yet (or a stale error state) → let the next mount refetch.
    void queryClient.invalidateQueries({ queryKey: ["arena", "self"], refetchType: "none" });
    return true;
  };
}
