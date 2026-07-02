"use server";

// Wallpaper catalog — Administrator-only management of the predefined set that
// children choose from on their dashboard. A wallpaper is either a SOLID COLOR
// (kind='solid_color', value = #rrggbb hex) or an IMAGE (kind='image',
// media_asset_id → media_assets). Image binaries live in the public
// `wallpaper-assets` bucket; PostgreSQL stores only the media_assets metadata row
// and the wallpapers catalog row. RLS additionally enforces admin-only writes.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { splitStoragePath, verifyStorageObject } from "@/lib/admin/media-verify";
import { getT } from "@/i18n/server";

export type WallpaperRow = {
  id: string;
  name: string;
  kind: "solid_color" | "image";
  value: string | null;
  status: string;
  imageUrl: string | null;
};

export type WallpaperState = { error?: string } | null;

// Image constraints — mirror the wallpaper-assets bucket (migration
// 2026_06_27_006): image-only (png/jpeg/webp), 3 MB.
const IMAGE_BUCKET = "wallpaper-assets";
const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_SIZE = 3 * 1024 * 1024;
// Strict final path segment (single segment, safe stem; svg/gif excluded to
// mirror the bucket's png/jpeg/webp whitelist).
const IMAGE_FILENAME_RE = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/;

// Server-side length cap on the wallpaper display name.
const NAME_MAX = 80;

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

// Azerbaijani-aware slugify so the code can be auto-generated from the name.
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
    .slice(0, 60);
}

// Codes are globally unique; append a short random suffix so distinct wallpapers
// with the same display name never collide on the unique code constraint.
function makeCode(name: string): string {
  const base = slugify(name) || "wallpaper";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function s(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function listWallpapers(): Promise<WallpaperRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("wallpapers")
    .select("id, name, kind, value, status, media_assets(bucket, path)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as any[]).map((r) => {
    let imageUrl: string | null = null;
    const m = r.media_assets;
    if (m?.bucket && m?.path) {
      imageUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
    }
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      value: r.value,
      status: r.status,
      imageUrl,
    };
  });
}

// Adds a solid-color wallpaper. Plain server action (name + hex), validated
// server-side; the browser also validates via required/pattern for UX.
export async function createSolidWallpaper(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  // Cap: wallpaper name ≤ 80 (trimmed rather than rejected — this is a void
  // form action with no error channel, so silent rejection would be hostile).
  const name = s(formData, "name").slice(0, NAME_MAX);
  const rawHex = s(formData, "hex");
  if (!name || !HEX_RE.test(rawHex)) return;

  const hex = `#${rawHex.replace(/^#/, "").toLowerCase()}`;
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("wallpapers")
    .insert({
      code: makeCode(name),
      name,
      kind: "solid_color",
      value: hex,
      status: "active",
    })
    .select("id")
    .single();

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.wallpaper.create",
      targetTable: "wallpapers",
      targetId: created?.id ?? null,
      metadata: { kind: "solid_color", name, value: hex },
    });
  }

  revalidatePath("/wallpapers");
}

// Records an image wallpaper: inserts a media_assets row and a wallpapers row
// (kind='image') linking it. The browser already uploaded the binary to
// wallpaper-assets. Admin-only. Mirrors attachNewsCover.
export async function attachWallpaperImage(
  formData: FormData,
): Promise<WallpaperState> {
  const ctx = await requireAdmin();
  const t = await getT();
  const name = s(formData, "name");
  const bucket = s(formData, "bucket");
  const path = s(formData, "path");
  // NOTE: client-submitted mime/size form fields are deliberately IGNORED —
  // both are derived server-side from the storage object below.

  if (!name) return { error: "Name is required." };
  // Cap: wallpaper name ≤ 80.
  if (name.length > NAME_MAX) return { error: t("err.tooLong") };
  if (bucket !== IMAGE_BUCKET) return { error: "Invalid bucket." };
  // Strict path shape: wallpapers/<single safe image filename> (no svg).
  const filename = splitStoragePath(path, "wallpapers/");
  if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
    return { error: "Invalid path." };
  }

  const supabase = await createClient();

  // Verify the object actually exists in the bucket and derive size + mime
  // server-side; reject when missing or outside the image whitelist.
  const obj = await verifyStorageObject(supabase, bucket, "wallpapers", filename);
  if (!obj) return { error: "Invalid path." };
  if (!IMAGE_MIME.includes(obj.mime)) return { error: "Unsupported file type." };
  if (obj.size > IMAGE_MAX_SIZE) {
    return { error: "File too large (max 3 MB)." };
  }

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
    console.error("[admin] wallpaper media insert failed", error?.message);
    return { error: t("err.server") };
  }

  const { data: created, error: insErr } = await supabase
    .from("wallpapers")
    .insert({
      code: makeCode(name),
      name,
      kind: "image",
      media_asset_id: media.id,
      status: "active",
    })
    .select("id")
    .single();
  if (insErr) {
    // Roll back the orphaned media on failure (best effort).
    await supabase.storage.from(bucket).remove([path]);
    await supabase.from("media_assets").delete().eq("id", media.id);
    console.error("[admin] wallpaper insert failed", insErr.message);
    return { error: t("err.server") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.wallpaper.create",
    targetTable: "wallpapers",
    targetId: created?.id ?? null,
    metadata: { kind: "image", name, path, mime: obj.mime, size: obj.size },
  });

  revalidatePath("/wallpapers");
  return null;
}

// Flips a wallpaper between active (listed for children) and archived (hidden).
// Plain server action driven by a form button. Admin-only.
export async function setWallpaperStatus(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = s(formData, "__id");
  const next = s(formData, "__status");
  if (!id || (next !== "active" && next !== "archived")) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("wallpapers")
    .update({ status: next })
    .eq("id", id);

  if (!error) {
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.wallpaper.status",
      targetTable: "wallpapers",
      targetId: id,
      metadata: { status: next },
    });
  }

  revalidatePath("/wallpapers");
}
