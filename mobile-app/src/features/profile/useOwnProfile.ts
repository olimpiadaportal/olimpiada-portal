// Own parent profile read: profiles row (display name, phone, avatar object)
// + the auth email, wrapped in one React Query result. RLS scopes the select
// to the signed-in user's own row; the avatar resolves through the public
// Storage URL helper (media bytes never live in Postgres).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { publicStorageUrl } from "@/lib/data";
import { useAuthStore } from "@/features/auth/authStore";

export type OwnProfile = {
  displayName: string;
  phone: string | null;
  email: string;
  avatarUrl: string | null;
};

export function useOwnProfile() {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery({
    queryKey: ["own-profile", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<OwnProfile> => {
      const [userRes, rowRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("profiles")
          .select("display_name, phone, avatar:avatar_media_id(bucket, path)")
          .eq("id", profileId!)
          .maybeSingle(),
      ]);
      if (rowRes.error) throw rowRes.error;
      const row = (rowRes.data ?? {}) as Record<string, unknown>;
      const avatar = (row.avatar ?? null) as unknown as { bucket: string; path: string } | null;
      return {
        displayName: typeof row.display_name === "string" ? row.display_name : "",
        phone: typeof row.phone === "string" && row.phone.length > 0 ? row.phone : null,
        email: userRes.data.user?.email ?? "",
        avatarUrl: avatar?.bucket && avatar?.path ? publicStorageUrl(avatar.bucket, avatar.path) : null,
      };
    },
  });
}

/** "AB" style initials from a display name, falling back to the email. */
export function initialsOf(displayName: string, email: string): string {
  const src = displayName.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase() || "•";
}
