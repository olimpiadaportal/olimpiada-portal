// PURE child-avatar resolution (no React / Supabase imports — unit-tested in
// __tests__/child-avatar.test.ts). Mirror of web-app/src/lib/childAvatar.ts:
// students.avatar_kind 'preset'|'photo', avatar_key 'boy'|'girl'|null,
// avatar_media_path = object path in the PRIVATE `child-avatars` bucket.
// preset+NULL key (or anything malformed) = the default initials bubble.
// Photos are NEVER public URLs — the viewer's own session signs a short-lived
// URL (RLS: creator/linked parent + the student itself; leaderboards never
// show photos).

export const CHILD_AVATAR_BUCKET = "child-avatars";
export const MAX_CHILD_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (bucket cap)

/** Signed-URL lifetime (web parity); the in-memory cache re-signs earlier. */
export const CHILD_AVATAR_SIGNED_TTL_SECONDS = 3600;

export const CHILD_AVATAR_PRESETS = ["boy", "girl"] as const;
export type ChildAvatarPreset = (typeof CHILD_AVATAR_PRESETS)[number];

export function isChildAvatarPreset(v: unknown): v is ChildAvatarPreset {
  return v === "boy" || v === "girl";
}

/** The three students columns every avatar-aware read selects. */
export type ChildAvatarFields = {
  avatar_kind?: string | null;
  avatar_key?: string | null;
  avatar_media_path?: string | null;
};

export type ChildAvatarSource =
  | { type: "photo"; path: string }
  | { type: "preset"; key: ChildAvatarPreset }
  | { type: "default" };

/**
 * Resolve what a student's avatar IS: photo (private object path to sign),
 * preset (bundled PNG key) or default (the existing initials bubble). Any
 * malformed/missing state degrades to "default" — never throws.
 */
export function resolveChildAvatarSource(
  row: ChildAvatarFields | null | undefined,
): ChildAvatarSource {
  if (!row) return { type: "default" };
  if (
    row.avatar_kind === "photo" &&
    typeof row.avatar_media_path === "string" &&
    row.avatar_media_path.length > 0
  ) {
    return { type: "photo", path: row.avatar_media_path };
  }
  if (row.avatar_kind === "preset" && isChildAvatarPreset(row.avatar_key)) {
    return { type: "preset", key: row.avatar_key };
  }
  return { type: "default" };
}

/** Photo-upload whitelist (server byte-sniff parity: png/jpeg/webp — NO gif,
 *  unlike the self-profile avatar; the server is the authority either way). */
export const CHILD_AVATAR_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export const CHILD_AVATAR_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export const CHILD_AVATAR_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
