"use server";

// Parent-managed child avatar server action (Add-Child wizard + Edit-Child).
// Authorize FIRST (getParent — in-form error instead of a redirect that would
// discard the submission), then the shared cores (lib/auth/childAvatarCore):
// ownership re-verified server-side, photo bytes sniffed, upload with the
// PARENT'S OWN session client (private-bucket storage RLS), students-row write
// via the service-role client AFTER authorization. Errors are localized here.
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getParent } from "@/lib/auth/session";
import {
  removeChildAvatarCore,
  setChildAvatarPhotoCore,
  setChildAvatarPresetCore,
  type ChildAvatarCoreResult,
} from "@/lib/auth/childAvatarCore";
import { getT } from "@/i18n/server";

export type ChildAvatarActionState = { ok?: boolean; error?: string } | null;

export async function saveChildAvatar(
  _prev: ChildAvatarActionState,
  formData: FormData,
): Promise<ChildAvatarActionState> {
  // Authorize FIRST — before reading any form field.
  const parent = await getParent();
  const t = await getT();
  if (!parent) return { error: t("childedit.err.generic") };

  const studentProfileId = String(formData.get("student_profile_id") ?? "").trim();
  const choice = String(formData.get("choice") ?? "").trim();

  // The parent's OWN session client — the private-bucket RLS applies to it.
  const userClient = await createServerSupabase();
  const revalidate = [
    "/dashboard",
    `/children/${studentProfileId}/edit`,
    "/subscription",
    "/child",
    "/child/profile",
  ];
  const base = {
    parentProfileId: parent.profileId,
    studentProfileId,
    revalidate,
  };

  let res: ChildAvatarCoreResult;
  // Enum whitelist on the choice — anything else is rejected generically.
  if (choice === "photo") {
    res = await setChildAvatarPhotoCore(userClient, {
      ...base,
      file: formData.get("avatar_file"),
    });
  } else if (choice === "boy" || choice === "girl") {
    res = await setChildAvatarPresetCore(userClient, { ...base, preset: choice });
  } else if (choice === "remove") {
    res = await removeChildAvatarCore(userClient, base);
  } else {
    return { error: t("childedit.err.generic") };
  }

  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}
