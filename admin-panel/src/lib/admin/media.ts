"use server";

// Records/removes question media. The actual file is uploaded to Supabase Storage
// by the browser client (RLS on storage.objects enforces admin/content access);
// these actions only manage the media_assets metadata row and the link on the
// question's translation. PostgreSQL never stores the binary.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import {
  QUESTION_MEDIA_FILENAME_RE,
  sniffVerifiedImage,
  splitStoragePath,
  verifyStorageObject,
} from "@/lib/admin/media-verify";
import { getT } from "@/i18n/server";

export type MediaState = { error?: string } | null;

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const LOCALES = ["az", "en", "ru"];
const BUCKET = "question-media";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function attachQuestionMedia(
  formData: FormData,
): Promise<MediaState> {
  const ctx = await requirePermission("content.create");
  const t = await getT();
  const questionId = String(formData.get("question_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const bucket = String(formData.get("bucket") ?? "");
  const path = String(formData.get("path") ?? "");
  // NOTE: client-submitted mime/size form fields are deliberately IGNORED —
  // both are derived server-side from the storage object below.

  if (!questionId || !UUID_RE.test(questionId) || !LOCALES.includes(locale)) {
    return { error: "Invalid request." };
  }
  if (bucket !== BUCKET) return { error: "Invalid bucket." };
  // Strict path shape: questions/<questionId>/<single safe filename>
  // (image or small-audio extensions only; svg rejected).
  const filename = splitStoragePath(path, `questions/${questionId}/`);
  if (!filename || !QUESTION_MEDIA_FILENAME_RE.test(filename)) {
    return { error: "Invalid path." };
  }

  const supabase = await createClient();

  // Verify the object actually exists in the bucket and derive size + mime
  // server-side; reject when missing or outside the whitelist.
  const obj = await verifyStorageObject(
    supabase,
    bucket,
    `questions/${questionId}`,
    filename,
  );
  if (!obj) return { error: "Invalid path." };
  if (!ALLOWED_MIME.includes(obj.mime)) return { error: "Unsupported file type." };
  if (obj.size > MAX_SIZE) return { error: "File too large (max 5 MB)." };

  // Byte-sniff image objects (M19): metadata mimetype is client-claimed, so
  // image types are re-derived from the actual magic numbers and the SNIFFED
  // mime is what gets recorded. Audio stays metadata-verified (the sniffer is
  // image-only; the bucket + filename whitelist still constrain audio).
  let recordedMime = obj.mime;
  if (obj.mime.startsWith("image/")) {
    const sniffed = await sniffVerifiedImage(supabase, bucket, path, obj.mime);
    if (!sniffed) return { error: "Unsupported file type." };
    recordedMime = sniffed;
  }

  // Remember any previous media so we can clean it up after re-linking.
  const { data: prev } = await supabase
    .from("question_translations")
    .select("media_asset_id")
    .eq("question_id", questionId)
    .eq("locale", locale)
    .maybeSingle();
  const prevId: string | null = prev?.media_asset_id ?? null;

  const { data: media, error } = await supabase
    .from("media_assets")
    .insert({
      bucket,
      path,
      owner_profile_id: ctx.profileId,
      // Server-derived values only — images use the SNIFFED mime.
      mime_type: recordedMime,
      file_size_bytes: obj.size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (error || !media) {
    console.error("[admin] question media insert failed", error?.message);
    return { error: t("err.server") };
  }

  const { error: linkErr } = await supabase
    .from("question_translations")
    .update({ media_asset_id: media.id })
    .eq("question_id", questionId)
    .eq("locale", locale);
  if (linkErr) {
    console.error("[admin] question media link failed", linkErr.message);
    return { error: t("err.server") };
  }

  if (prevId) {
    const { data: pm } = await supabase
      .from("media_assets")
      .select("bucket, path")
      .eq("id", prevId)
      .maybeSingle();
    if (pm) await supabase.storage.from(pm.bucket).remove([pm.path]);
    await supabase.from("media_assets").delete().eq("id", prevId);
  }

  revalidatePath(`/questions/${questionId}/edit`);
  return null;
}

export async function detachQuestionMedia(formData: FormData): Promise<void> {
  await requirePermission("content.create");
  const questionId = String(formData.get("question_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (!questionId || !LOCALES.includes(locale)) return;

  const supabase = await createClient();
  const { data: tr } = await supabase
    .from("question_translations")
    .select("media_asset_id")
    .eq("question_id", questionId)
    .eq("locale", locale)
    .maybeSingle();
  const mediaId: string | null = tr?.media_asset_id ?? null;

  await supabase
    .from("question_translations")
    .update({ media_asset_id: null })
    .eq("question_id", questionId)
    .eq("locale", locale);

  if (mediaId) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path")
      .eq("id", mediaId)
      .maybeSingle();
    if (m) await supabase.storage.from(m.bucket).remove([m.path]);
    await supabase.from("media_assets").delete().eq("id", mediaId);
  }

  revalidatePath(`/questions/${questionId}/edit`);
}
