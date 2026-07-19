// SERVER-ONLY child-avatar CORES (parent-managed avatars) — shared by the web
// server action (lib/auth/childAvatarActions, parent cookie client) and the
// mobile BFF endpoint (/api/mobile/v1/children/[id]/avatar, bearer client).
//
// Contract (students table + PRIVATE `child-avatars` bucket):
//   photo  → upload `students/<student_profile_id>/<uuid>.<ext>` with the
//            PARENT'S OWN client (storage RLS: creator/linked parent write),
//            then students {avatar_kind:'photo', avatar_media_path, key:null}
//   preset → students {avatar_kind:'preset', avatar_key:'boy'|'girl',
//            avatar_media_path:null}
//   remove → students {avatar_kind:'preset', avatar_key:null,
//            avatar_media_path:null} (the initials-bubble default)
// Replaced/removed photo objects are deleted best-effort with the parent's own
// client. The students-row write uses the service-role client AFTER the
// ownership re-verification (parentCore pattern). R7 security: uploads are
// typed from magic bytes (imageSniff), never the client-declared mime; SVG/GIF
// are rejected (png/jpeg/webp only). Errors are i18n KEYS, never localized text.
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { sniffImageMime, EXT_BY_SNIFFED } from "@/lib/imageSniff";
import { isUuid } from "@/lib/uuid";
import {
  CHILD_AVATAR_BUCKET,
  MAX_CHILD_AVATAR_BYTES,
  type ChildAvatarPreset,
} from "@/lib/childAvatar";

export type ChildAvatarState = {
  avatar_kind: "preset" | "photo";
  avatar_key: ChildAvatarPreset | null;
  has_photo: boolean;
};

export type ChildAvatarCoreResult =
  | { ok: true; state: ChildAvatarState }
  | {
      ok: false;
      errorKey:
        | "childedit.err.generic"
        | "childedit.err.notYourChild"
        | "profile.err.fileType"
        | "profile.err.fileTooLarge"
        | "profile.err.uploadFailed"
        | "profile.err.updateFailed";
    };

/** True when the parent created the child OR holds an active link (mirrors
 *  childAccountService.parentOwnsChild — the same families storage RLS trusts). */
async function parentOwnsChild(
  parentProfileId: string,
  studentProfileId: string,
): Promise<boolean> {
  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (!student) return false;
  if (student.created_by_parent_profile_id === parentProfileId) return true;
  const { data: link } = await admin
    .from("parent_student_links")
    .select("id")
    .eq("parent_profile_id", parentProfileId)
    .eq("student_profile_id", studentProfileId)
    .eq("status", "active")
    .maybeSingle();
  return !!link;
}

async function currentMediaPath(studentProfileId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("students")
    .select("avatar_media_path")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  return (data?.avatar_media_path as string | null) ?? null;
}

/** Best-effort delete of a replaced/removed photo object (parent's own client —
 *  storage RLS allows the linked family; never fails the operation). */
async function removeObject(client: SupabaseClient, path: string | null): Promise<void> {
  if (!path) return;
  await client.storage
    .from(CHILD_AVATAR_BUCKET)
    .remove([path])
    .catch(() => {});
}

/** Authoritative students-row write (service-role AFTER authorization). */
async function writeAvatarRow(
  studentProfileId: string,
  fields: {
    avatar_kind: "preset" | "photo";
    avatar_key: ChildAvatarPreset | null;
    avatar_media_path: string | null;
  },
): Promise<boolean> {
  const admin = getAdminClient();
  const { error } = await admin
    .from("students")
    .update(fields)
    .eq("profile_id", studentProfileId);
  return !error;
}

function refresh(revalidate: string[] | undefined): void {
  for (const route of revalidate ?? []) revalidatePath(route);
}

/**
 * Set/replace the child's PHOTO avatar. `userClient` must be the requesting
 * PARENT'S own client (cookie session on the web, bearer on the BFF) so the
 * private-bucket storage RLS applies to the upload. The caller MUST have
 * authenticated the parent first; ownership of the student is re-verified here.
 */
export async function setChildAvatarPhotoCore(
  userClient: SupabaseClient,
  params: {
    parentProfileId: string;
    studentProfileId: string;
    file: unknown;
    revalidate?: string[];
  },
): Promise<ChildAvatarCoreResult> {
  const { parentProfileId, studentProfileId, file } = params;
  if (!isUuid(studentProfileId)) return { ok: false, errorKey: "childedit.err.generic" };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errorKey: "profile.err.uploadFailed" };
  }
  if (file.size > MAX_CHILD_AVATAR_BYTES) {
    return { ok: false, errorKey: "profile.err.fileTooLarge" };
  }
  // Type from BYTES, never the attacker-controlled file.type. This bucket
  // accepts png/jpeg/webp only (no gif, never svg).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || sniffed === "image/gif") {
    return { ok: false, errorKey: "profile.err.fileType" };
  }

  if (!(await parentOwnsChild(parentProfileId, studentProfileId))) {
    return { ok: false, errorKey: "childedit.err.notYourChild" };
  }

  const oldPath = await currentMediaPath(studentProfileId);

  const ext = EXT_BY_SNIFFED[sniffed];
  const path = `students/${studentProfileId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await userClient.storage
    .from(CHILD_AVATAR_BUCKET)
    .upload(path, bytes, { contentType: sniffed, upsert: false });
  if (uploadError) return { ok: false, errorKey: "profile.err.uploadFailed" };

  const wrote = await writeAvatarRow(studentProfileId, {
    avatar_kind: "photo",
    avatar_key: null,
    avatar_media_path: path,
  });
  if (!wrote) {
    // Roll the orphaned object back (best-effort) — the row still points at
    // the previous avatar.
    await removeObject(userClient, path);
    return { ok: false, errorKey: "profile.err.updateFailed" };
  }

  if (oldPath && oldPath !== path) await removeObject(userClient, oldPath);
  refresh(params.revalidate);
  return {
    ok: true,
    state: { avatar_kind: "photo", avatar_key: null, has_photo: true },
  };
}

/**
 * Set a PRESET avatar ('boy'|'girl'); any previous photo object is deleted
 * best-effort. Same authorization contract as the photo core.
 */
export async function setChildAvatarPresetCore(
  userClient: SupabaseClient,
  params: {
    parentProfileId: string;
    studentProfileId: string;
    preset: string;
    revalidate?: string[];
  },
): Promise<ChildAvatarCoreResult> {
  const { parentProfileId, studentProfileId, preset } = params;
  if (!isUuid(studentProfileId)) return { ok: false, errorKey: "childedit.err.generic" };
  // Enum whitelist — never pass client strings through.
  if (preset !== "boy" && preset !== "girl") {
    return { ok: false, errorKey: "childedit.err.generic" };
  }
  if (!(await parentOwnsChild(parentProfileId, studentProfileId))) {
    return { ok: false, errorKey: "childedit.err.notYourChild" };
  }

  const oldPath = await currentMediaPath(studentProfileId);
  const wrote = await writeAvatarRow(studentProfileId, {
    avatar_kind: "preset",
    avatar_key: preset,
    avatar_media_path: null,
  });
  if (!wrote) return { ok: false, errorKey: "profile.err.updateFailed" };

  await removeObject(userClient, oldPath);
  refresh(params.revalidate);
  return {
    ok: true,
    state: { avatar_kind: "preset", avatar_key: preset, has_photo: false },
  };
}

/**
 * Back to the default (initials bubble): kind='preset', key=null, path=null;
 * any photo object is deleted best-effort.
 */
export async function removeChildAvatarCore(
  userClient: SupabaseClient,
  params: {
    parentProfileId: string;
    studentProfileId: string;
    revalidate?: string[];
  },
): Promise<ChildAvatarCoreResult> {
  const { parentProfileId, studentProfileId } = params;
  if (!isUuid(studentProfileId)) return { ok: false, errorKey: "childedit.err.generic" };
  if (!(await parentOwnsChild(parentProfileId, studentProfileId))) {
    return { ok: false, errorKey: "childedit.err.notYourChild" };
  }

  const oldPath = await currentMediaPath(studentProfileId);
  const wrote = await writeAvatarRow(studentProfileId, {
    avatar_kind: "preset",
    avatar_key: null,
    avatar_media_path: null,
  });
  if (!wrote) return { ok: false, errorKey: "profile.err.updateFailed" };

  await removeObject(userClient, oldPath);
  refresh(params.revalidate);
  return {
    ok: true,
    state: { avatar_kind: "preset", avatar_key: null, has_photo: false },
  };
}
