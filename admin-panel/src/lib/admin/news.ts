"use server";

// News module — Administrator-only CRUD (Content Managers are excluded per the
// product rules). Language-neutral `news` row + per-locale `news_translations`
// (az required; en/ru optional). RLS additionally enforces admin-only writes.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  IMAGE_FILENAME_RE,
  splitStoragePath,
  verifyStorageObject,
} from "@/lib/admin/media-verify";
import { getT } from "@/i18n/server";

export type NewsState = { error?: string } | null;
export type NewsCoverState = { error?: string } | null;

const LOCALES = ["az", "en", "ru"] as const;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-side length caps on free text (defence-in-depth; the UI also limits).
const TITLE_MAX = 200;
const BODY_MAX = 20000;
const SLUG_MAX = 120;

// Cover image constraints — mirror the news-media bucket (014_news.sql): image-only,
// 5 MB. The binary lives in Supabase Storage; PostgreSQL stores only the metadata
// row (media_assets) + the link on news.cover_media_id.
const COVER_BUCKET = "news-media";
const COVER_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const COVER_MAX_SIZE = 5 * 1024 * 1024;

// Azerbaijani-aware slugify so the slug can be auto-generated from the az title.
const AZ_MAP: Record<string, string> = {
  ə: "e", ö: "o", ü: "u", ğ: "g", ı: "i", ç: "c", ş: "s",
};
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[əöügıçş]/g, (c) => AZ_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function s(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function saveNews(
  _prev: NewsState,
  formData: FormData,
): Promise<NewsState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const id = s(formData, "__id");
  const titleAz = s(formData, "title_az");
  const bodyAz = s(formData, "body_az");
  if (!titleAz || !bodyAz) return { error: t("news.err.azRequired") };

  // Server-side length caps: title ≤ 200, body ≤ 20000 (every locale is checked
  // again in the loop below).
  for (const loc of LOCALES) {
    if (s(formData, `title_${loc}`).length > TITLE_MAX) return { error: t("err.tooLong") };
    if (s(formData, `body_${loc}`).length > BODY_MAX) return { error: t("err.tooLong") };
  }

  // Slug (URL) is OPTIONAL — auto-generate from the az title when blank.
  // Cap: slug ≤ 120 (falls back to a generated slug, same as a failed SLUG_RE).
  let slug = s(formData, "slug").toLowerCase();
  if (!slug) slug = slugify(titleAz);
  if (slug.length > SLUG_MAX || !SLUG_RE.test(slug)) slug = `news-${Date.now()}`;

  const supabase = await createClient();
  let newsId = id;
  const isCreate = !newsId;

  if (!newsId) {
    const { data, error } = await supabase
      .from("news")
      .insert({ slug, status: "draft", created_by: ctx.profileId })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[admin] news insert failed", error?.message);
      return { error: t("err.server") };
    }
    newsId = data.id;
  } else {
    const { error } = await supabase.from("news").update({ slug }).eq("id", newsId);
    if (error) {
      console.error("[admin] news update failed", error.message);
      return { error: t("err.server") };
    }
  }

  for (const loc of LOCALES) {
    const title = s(formData, `title_${loc}`);
    const body = s(formData, `body_${loc}`);
    if (title && body) {
      const { error } = await supabase
        .from("news_translations")
        .upsert(
          { news_id: newsId, locale: loc, title, body },
          { onConflict: "news_id,locale" },
        );
      if (error) {
        console.error("[admin] news translation upsert failed", error.message);
        return { error: t("err.server") };
      }
    } else if (id) {
      // Translation cleared on edit → remove it.
      await supabase
        .from("news_translations")
        .delete()
        .eq("news_id", newsId)
        .eq("locale", loc);
    }
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: isCreate ? "admin.news.create" : "admin.news.update",
    targetTable: "news",
    targetId: newsId,
    metadata: { slug },
  });

  revalidatePath("/news");
  // On first create (from the Add-News page) land back on /news/new with the new
  // id so the featured-image uploader appears at the end of the same flow. Edits
  // go straight to the full edit page (which has its own cover uploader).
  if (isCreate && s(formData, "__afterCreate") === "stay") {
    redirect(`/news/new?created=${newsId}`);
  }
  redirect(`/news/${newsId}/edit`);
}

const NEWS_TRANSITIONS: Record<
  string,
  { from: string[]; to: string; setPublished?: boolean }
> = {
  publish: { from: ["draft", "archived"], to: "published", setPublished: true },
  unpublish: { from: ["published"], to: "draft" },
  archive: { from: ["draft", "published"], to: "archived" },
};

export async function transitionNews(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  const action = s(formData, "__action");
  const tr = NEWS_TRANSITIONS[action];
  if (!id || !tr) return;

  const supabase = await createClient();
  const { data: n } = await supabase
    .from("news")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!n || !tr.from.includes(n.status)) return;

  const patch: Record<string, unknown> = { status: tr.to };
  if (tr.setPublished) patch.published_at = new Date().toISOString();
  const { error } = await supabase.from("news").update(patch).eq("id", id);

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.news.transition",
      targetTable: "news",
      targetId: id,
      metadata: { transition: action, from: n.status, to: tr.to },
    });
  }

  revalidatePath("/news");
  revalidatePath(`/news/${id}/edit`);
}

// Records a cover image: inserts a media_assets row and links it on
// news.cover_media_id. The browser already uploaded the binary to news-media.
// Admin-only (News is excluded from Content Managers).
export async function attachNewsCover(
  formData: FormData,
): Promise<NewsCoverState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const newsId = s(formData, "news_id");
  const bucket = s(formData, "bucket");
  const path = s(formData, "path");
  // NOTE: client-submitted mime/size form fields are deliberately IGNORED —
  // both are derived server-side from the storage object below.

  if (!newsId || !UUID_RE.test(newsId)) return { error: "Invalid request." };
  if (bucket !== COVER_BUCKET) return { error: "Invalid bucket." };
  // Strict path shape: news/<newsId>/<single safe image filename> (no svg).
  const filename = splitStoragePath(path, `news/${newsId}/`);
  if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
    return { error: "Invalid path." };
  }

  const supabase = await createClient();

  // Verify the object actually exists in the bucket and derive size + mime
  // server-side; reject when missing or outside the image whitelist.
  const obj = await verifyStorageObject(supabase, bucket, `news/${newsId}`, filename);
  if (!obj) return { error: "Invalid path." };
  if (!COVER_MIME.includes(obj.mime)) return { error: "Unsupported file type." };
  if (obj.size > COVER_MAX_SIZE) {
    return { error: "File too large (max 5 MB)." };
  }

  // Remember any previous cover so we can clean it up after re-linking.
  const { data: prev } = await supabase
    .from("news")
    .select("cover_media_id")
    .eq("id", newsId)
    .maybeSingle();
  const prevId: string | null = prev?.cover_media_id ?? null;

  const { data: media, error } = await supabase
    .from("media_assets")
    .insert({
      bucket,
      path,
      owner_profile_id: ctx.profileId,
      // Server-derived values only (never the client-submitted form fields).
      mime_type: obj.mime,
      file_size_bytes: obj.size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (error || !media) {
    console.error("[admin] news cover media insert failed", error?.message);
    return { error: t("err.server") };
  }

  const { error: linkErr } = await supabase
    .from("news")
    .update({ cover_media_id: media.id })
    .eq("id", newsId);
  if (linkErr) {
    console.error("[admin] news cover link failed", linkErr.message);
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

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.news.cover_attach",
    targetTable: "news",
    targetId: newsId,
    metadata: { path, mime: obj.mime, size: obj.size },
  });

  revalidatePath(`/news/${newsId}/edit`);
  return null;
}

// Removes the cover: nulls news.cover_media_id, deletes the storage object and the
// media_assets row. Admin-only.
export async function detachNewsCover(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const newsId = s(formData, "news_id");
  if (!newsId) return;

  const supabase = await createClient();
  const { data: n } = await supabase
    .from("news")
    .select("cover_media_id")
    .eq("id", newsId)
    .maybeSingle();
  const mediaId: string | null = n?.cover_media_id ?? null;

  await supabase.from("news").update({ cover_media_id: null }).eq("id", newsId);

  if (mediaId) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path")
      .eq("id", mediaId)
      .maybeSingle();
    if (m) await supabase.storage.from(m.bucket).remove([m.path]);
    await supabase.from("media_assets").delete().eq("id", mediaId);
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.news.cover_detach",
    targetTable: "news",
    targetId: newsId,
  });

  revalidatePath(`/news/${newsId}/edit`);
}

export async function deleteNews(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("news").delete().eq("id", id);

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.news.delete",
      targetTable: "news",
      targetId: id,
      severity: "warning",
    });
  }

  revalidatePath("/news");
  redirect("/news");
}
