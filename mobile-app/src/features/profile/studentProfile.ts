// Student self-profile reads + the sticker-theme selection writes. Everything
// runs on the child's OWN JWT:
//   * students / profiles reads are RLS self-row scoped (web child/profile
//     page parity, including the structured-catalog → free-text fallbacks),
//   * sticker catalog reads see ENABLED themes only (RLS),
//   * child_sticker_selections upsert/delete is the web stickerActions
//     contract: RLS lets the child write only their OWN row and WITH CHECK
//     only accepts enabled themes — no service role anywhere.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { publicStorageUrl } from "@/lib/data";
import { useAuthStore } from "@/features/auth/authStore";
import type { ArenaPalette } from "@/theme/tokens";
import type { ChildAvatarFields } from "@/lib/childAvatar";
import { normalizePalette } from "./useArenaPalette";

// ---- own student profile -------------------------------------------------------

export type StudentProfile = {
  firstName: string;
  lastName: string;
  name: string;
  initial: string;
  /** The 8-digit login id (digits; render grouped "1234 5678"). */
  uniqueId: string;
  palette: ArenaPalette;
  /** Structured grade (level+name) with the free-text class_grade fallback. */
  grade: { level: number; name: string } | null;
  classGrade: string | null;
  city: string | null;
  school: string | null;
  /** Legacy SELF-uploaded profile avatar (public bucket). The parent-set
   *  avatar below WINS over it (web child-header priority parity). */
  avatarUrl: string | null;
  /** Parent-managed avatar columns from the OWN students row (RLS self-read);
   *  ChildAvatar resolves preset/photo/default from these. */
  avatar: ChildAvatarFields | null;
};

export const studentProfileKey = (profileId: string | null) =>
  ["student-profile", profileId] as const;

export function useStudentProfile(opts?: { enabled?: boolean }) {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery<StudentProfile>({
    queryKey: studentProfileKey(profileId),
    enabled: !!profileId && (opts?.enabled ?? true),
    queryFn: async () => {
      const [studentRes, profRes] = await Promise.all([
        supabase
          .from("students")
          .select(
            "first_name, last_name, child_unique_id, palette, city, school_name, class_grade, " +
              "avatar_kind, avatar_key, avatar_media_path, " +
              "grade:grade_id(name, level), district:district_id(name), school:school_id(name)",
          )
          .eq("profile_id", profileId!)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("avatar:avatar_media_id(bucket, path)")
          .eq("id", profileId!)
          .maybeSingle(),
      ]);
      if (studentRes.error) throw studentRes.error;
      const s = (studentRes.data ?? {}) as Record<string, any>;
      const first = typeof s.first_name === "string" ? s.first_name : "";
      const last = typeof s.last_name === "string" ? s.last_name : "";
      const name = `${first} ${last}`.trim();
      // Avatar read degrades to initials on any failure (web parity).
      const avatar = (profRes.data as Record<string, any> | null)?.avatar as
        | { bucket: string; path: string }
        | null
        | undefined;
      return {
        firstName: first,
        lastName: last,
        name,
        initial: (first.trim()[0] ?? name.trim()[0] ?? "?").toUpperCase(),
        uniqueId: typeof s.child_unique_id === "string" ? s.child_unique_id : "",
        palette: normalizePalette(s.palette),
        grade:
          s.grade && typeof s.grade.level === "number"
            ? { level: s.grade.level, name: String(s.grade.name ?? "") }
            : null,
        classGrade: (s.class_grade ?? "").trim() || null,
        city: ((s.district?.name ?? s.city ?? "") as string).trim() || null,
        school: ((s.school?.name ?? s.school_name ?? "") as string).trim() || null,
        avatarUrl:
          avatar?.bucket && avatar?.path ? publicStorageUrl(avatar.bucket, avatar.path) : null,
        avatar: {
          avatar_kind: typeof s.avatar_kind === "string" ? s.avatar_kind : null,
          avatar_key: typeof s.avatar_key === "string" ? s.avatar_key : null,
          avatar_media_path:
            typeof s.avatar_media_path === "string" ? s.avatar_media_path : null,
        },
      };
    },
  });
}

// ---- character-sticker themes ---------------------------------------------------

export type StickerTheme = {
  id: string;
  name: string;
  /** ≤3 public sample sticker URLs for the collage. */
  samples: string[];
  count: number;
};

export function useStickerThemes() {
  return useQuery<StickerTheme[]>({
    queryKey: ["sticker-themes"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: themeRows, error } = await supabase
        .from("sticker_themes")
        .select("id, name")
        .eq("is_enabled", true)
        .order("name");
      if (error) throw error;
      const themes = (themeRows ?? []) as { id: string; name: string }[];
      if (themes.length === 0) return [];
      const { data: imageRows } = await supabase
        .from("sticker_images")
        .select("theme_id, order_index, media:media_asset_id(bucket, path)")
        .in(
          "theme_id",
          themes.map((th) => th.id),
        )
        .order("order_index");
      const byTheme = new Map<string, { samples: string[]; count: number }>();
      for (const row of (imageRows ?? []) as Record<string, any>[]) {
        const entry = byTheme.get(row.theme_id) ?? { samples: [], count: 0 };
        entry.count += 1;
        const m = row.media as { bucket?: string; path?: string } | null;
        if (entry.samples.length < 3 && m?.bucket && m?.path) {
          entry.samples.push(publicStorageUrl(m.bucket, m.path));
        }
        byTheme.set(row.theme_id, entry);
      }
      return themes.map((th) => ({
        id: th.id,
        name: th.name,
        samples: byTheme.get(th.id)?.samples ?? [],
        count: byTheme.get(th.id)?.count ?? 0,
      }));
    },
  });
}

export const stickerSelectionKey = (profileId: string | null) =>
  ["sticker-selection", profileId] as const;

/** The child's selected theme id (null = stickers off). */
export function useStickerSelection() {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery<string | null>({
    queryKey: stickerSelectionKey(profileId),
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_sticker_selections")
        .select("theme_id")
        .eq("student_profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { theme_id?: string | null } | null)?.theme_id ?? null;
    },
  });
}

/**
 * Select a theme (upsert own row) or clear it (delete own row) — the exact
 * table writes web selectStickerTheme/clearStickerTheme perform, on the
 * child's own JWT. Returns false on failure (a disabled theme lands there
 * too); callers show the generic trilingual sticker error.
 */
export function useSetStickerTheme() {
  const profileId = useAuthStore((s) => s.profileId);
  const queryClient = useQueryClient();
  return async (themeId: string | null): Promise<boolean> => {
    if (!profileId) return false;
    if (themeId) {
      const { error } = await supabase
        .from("child_sticker_selections")
        .upsert(
          { student_profile_id: profileId, theme_id: themeId },
          { onConflict: "student_profile_id" },
        );
      if (error) return false;
    } else {
      const { error } = await supabase
        .from("child_sticker_selections")
        .delete()
        .eq("student_profile_id", profileId);
      if (error) return false;
    }
    queryClient.setQueryData(stickerSelectionKey(profileId), themeId);
    return true;
  };
}
