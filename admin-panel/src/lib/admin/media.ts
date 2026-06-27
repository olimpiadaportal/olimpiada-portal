"use server";

// Records/removes question media. The actual file is uploaded to Supabase Storage
// by the browser client (RLS on storage.objects enforces admin/content access);
// these actions only manage the media_assets metadata row and the link on the
// question's translation. PostgreSQL never stores the binary.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";

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

export async function attachQuestionMedia(
  formData: FormData,
): Promise<MediaState> {
  const ctx = await requirePermission("content.create");
  const questionId = String(formData.get("question_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const bucket = String(formData.get("bucket") ?? "");
  const path = String(formData.get("path") ?? "");
  const mime = String(formData.get("mime") ?? "");
  const size = Number(formData.get("size") ?? 0);

  if (!questionId || !LOCALES.includes(locale)) return { error: "Invalid request." };
  if (bucket !== BUCKET) return { error: "Invalid bucket." };
  if (!path.startsWith(`questions/${questionId}/`)) return { error: "Invalid path." };
  if (!ALLOWED_MIME.includes(mime)) return { error: "Unsupported file type." };
  if (size <= 0 || size > MAX_SIZE) return { error: "File too large (max 5 MB)." };

  const supabase = await createClient();

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
      mime_type: mime,
      file_size_bytes: size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (error || !media) return { error: error?.message ?? "Could not record media." };

  const { error: linkErr } = await supabase
    .from("question_translations")
    .update({ media_asset_id: media.id })
    .eq("question_id", questionId)
    .eq("locale", locale);
  if (linkErr) return { error: linkErr.message };

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
