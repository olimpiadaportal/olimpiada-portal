import "server-only";

// Child avatar (parent-managed) — shared constants + the display-URL resolver.
//
// Model (students table): avatar_kind 'preset'|'photo' (default 'preset'),
// avatar_key 'boy'|'girl'|null (NULL + preset = the initials-bubble default),
// avatar_media_path = object path in the PRIVATE `child-avatars` bucket
// (`students/<student_profile_id>/<generated>.<ext>`). The bucket has NO anon
// access — photos render through SHORT-LIVED SIGNED URLs created with the
// VIEWER'S OWN session client (storage RLS: creator/linked parent + the
// student itself can read; leaderboards never show photos).
import type { SupabaseClient } from "@supabase/supabase-js";

export const CHILD_AVATAR_BUCKET = "child-avatars";
export const MAX_CHILD_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (bucket cap)

export const CHILD_AVATAR_PRESETS = ["boy", "girl"] as const;
export type ChildAvatarPreset = (typeof CHILD_AVATAR_PRESETS)[number];

/** Project-generated preset assets (web-app/public/avatars). */
export const CHILD_AVATAR_PRESET_SRC: Record<ChildAvatarPreset, string> = {
  boy: "/avatars/child-boy.png",
  girl: "/avatars/child-girl.png",
};

/** Signed-URL lifetime for photo avatars (~1h; pages re-sign on each render). */
export const CHILD_AVATAR_SIGNED_TTL_SECONDS = 3600;

export type ChildAvatarRow = {
  avatar_kind?: string | null;
  avatar_key?: string | null;
  avatar_media_path?: string | null;
};

function isPreset(key: string | null | undefined): key is ChildAvatarPreset {
  return key === "boy" || key === "girl";
}

/**
 * Resolve the display URL for a student's parent-managed avatar:
 * photo → signed URL via the CALLER'S client (RLS decides visibility),
 * preset → the bundled PNG, default/none/any failure → null (the caller
 * renders the existing initials bubble). Never throws.
 */
export async function resolveChildAvatarUrl(
  supabase: SupabaseClient,
  row: ChildAvatarRow | null | undefined,
): Promise<string | null> {
  if (!row) return null;
  if (row.avatar_kind === "photo" && row.avatar_media_path) {
    try {
      const { data, error } = await supabase.storage
        .from(CHILD_AVATAR_BUCKET)
        .createSignedUrl(row.avatar_media_path, CHILD_AVATAR_SIGNED_TTL_SECONDS);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      // fall through to null (initials bubble)
    }
    return null;
  }
  if (row.avatar_kind === "preset" && isPreset(row.avatar_key)) {
    return CHILD_AVATAR_PRESET_SRC[row.avatar_key];
  }
  return null;
}
