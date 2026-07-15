// Shared client-side helpers for the news cover-image flow, used by BOTH the
// edit page's NewsCoverUploader and the create form's inline cover picker so
// the two paths stay byte-identical: same client pre-checks (type whitelist,
// 5 MB cap — UX only), same storage path shape and the same hardened
// attachNewsCover server action (which re-derives mime/size server-side and
// byte-sniffs the object; the client claims are never trusted).
import { createClient } from "@/lib/supabase/client";
import { attachNewsCover } from "@/lib/admin/news";

// Cover is image-only to match the news-media bucket's allowed_mime_types.
export const NEWS_COVER_ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
export const NEWS_COVER_MAX = 5 * 1024 * 1024;
export const NEWS_COVER_BUCKET = "news-media";

// crypto.randomUUID() only exists in secure contexts (https / localhost). When
// the app is opened over a LAN IP it is undefined, so fall back gracefully.
export function newsCoverUniqueId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and use the fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Quick client-side pre-check (UX only — the server action is the authority).
export function isValidNewsCover(file: File): boolean {
  return NEWS_COVER_ALLOWED.includes(file.type) && file.size <= NEWS_COVER_MAX;
}

// Uploads the browser file to the news-media bucket under the article's folder
// and records/links it via the guarded attachNewsCover server action.
// Returns an error message string, or null on success.
export async function uploadAndAttachNewsCover(
  newsId: string,
  file: File,
): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `news/${newsId}/${newsCoverUniqueId()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(NEWS_COVER_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) return upErr.message;

  const fd = new FormData();
  fd.set("news_id", newsId);
  fd.set("bucket", NEWS_COVER_BUCKET);
  fd.set("path", path);
  fd.set("mime", file.type);
  fd.set("size", String(file.size));

  const res = await attachNewsCover(fd);
  return res?.error ?? null;
}
