// students.theme_pref on MOBILE — the read side that was missing.
//
// THE BUG THIS FIXES
// ------------------
// Dark/light on the phone was a purely DEVICE-local tri-state in SecureStore
// (ThemeProvider, default "system"), and nothing in the app ever read
// students.theme_pref — the column was written here (choosing a palette
// persists theme_pref='light') and never read back. So a child who picked
// Aurora on the web, then opened the app on a phone in system-dark, got a DARK
// arena with no palette at all: arenaTokens() ignores the palette in dark
// because palettes are a light-mode surface. "Your choice persists across
// future sessions" was true on the web and false on the phone.
//
// THE MODEL
// ---------
// The SERVER value wins ONCE per signed-in student — on the first load of the
// self row after launch/login — and after that the child's device toggle wins
// and is written straight back to the column, so the next device inherits it.
// Applying it on every render instead would make the local toggle un-flippable;
// applying it never is the bug above.
//
// Parent sessions are untouched: `useStudentSelf` is student-scoped, so for a
// parent this hook resolves to null data and does nothing at all.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";
import { QK, useStudentSelf, type StudentSelf } from "@/features/arena/queries";
import { useTheme, type ThemePreference } from "@/theme/ThemeProvider";

/**
 * Adopt the stored preference once the student's own row arrives. Mount it in
 * the student shell; it renders nothing.
 */
export function useStudentThemeSync(): void {
  const profileId = useAuthStore((s) => s.profileId);
  const themePref = useStudentSelf().data?.themePref ?? null;
  const { preference, setPreference } = useTheme();
  // Keyed by profile id, so signing in as another child re-adopts that child's
  // stored preference instead of keeping the previous one.
  const adoptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId || !themePref) return;
    if (adoptedFor.current === profileId) return;
    adoptedFor.current = profileId;
    if (preference !== themePref) setPreference(themePref);
  }, [profileId, themePref, preference, setPreference]);
}

/**
 * Set the theme for a signed-in student: the device preference AND the column,
 * so the choice reaches every other device (and the web arena, which paints
 * from the same column via its `theme` cookie).
 *
 * Returns false when the write did not land. The device preference is applied
 * either way — refusing to honour a tap because the network is down would be a
 * worse experience than a preference that is device-local until the next save.
 */
export function useSetStudentTheme() {
  const profileId = useAuthStore((s) => s.profileId);
  const role = useAuthStore((s) => s.role);
  const queryClient = useQueryClient();
  const { setPreference } = useTheme();

  return async (next: ThemePreference): Promise<boolean> => {
    setPreference(next);
    // "system" is a DEVICE resolution rule, not one of the two values the
    // students_theme_pref_chk CHECK accepts — there is nothing to persist.
    if (next === "system") return true;
    if (role !== "student" || !profileId) return true;

    // .select(): PostgREST reports no error when an UPDATE matches zero rows.
    const { data: saved, error } = await supabase
      .from("students")
      .update({ theme_pref: next })
      .eq("profile_id", profileId)
      .select("profile_id");
    if (error || !saved || saved.length === 0) return false;

    queryClient.setQueryData<StudentSelf>(QK.self(profileId), (prev) =>
      prev ? { ...prev, themePref: next } : prev,
    );
    return true;
  };
}
